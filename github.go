package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// githubClientID identifica o OAuth App registrado no /ide.
// Para apps desktop o Client ID não é segredo (Device Flow não usa client_secret).
const githubClientID = "Ov23liin2A54us9DvIoX"

const (
	githubDeviceCodeURL  = "https://github.com/login/device/code"
	githubAccessTokenURL = "https://github.com/login/oauth/access_token"
	githubAPIBase        = "https://api.github.com"
	githubTokenKey       = "github.token"
)

type GitHubUser struct {
	Login       string `json:"login"`
	Name        string `json:"name"`
	AvatarURL   string `json:"avatarUrl"`
	Bio         string `json:"bio"`
	Company     string `json:"company"`
	Location    string `json:"location"`
	Blog        string `json:"blog"`
	Email       string `json:"email"`
	HTMLURL     string `json:"htmlUrl"`
	PublicRepos int    `json:"publicRepos"`
	Followers   int    `json:"followers"`
	Following   int    `json:"following"`
	CreatedAt   string `json:"createdAt"`
}

type DeviceFlowStart struct {
	UserCode        string `json:"userCode"`
	VerificationURI string `json:"verificationUri"`
	DeviceCode      string `json:"deviceCode"`
	Interval        int    `json:"interval"`
	ExpiresIn       int    `json:"expiresIn"`
}

type GitHubUserRepo struct {
	Name        string `json:"name"`
	FullName    string `json:"fullName"`
	Description string `json:"description"`
	HTMLURL     string `json:"htmlUrl"`
	CloneURL    string `json:"cloneUrl"`
	Language    string `json:"language"`
	Stars       int    `json:"stars"`
	Forks       int    `json:"forks"`
	UpdatedAt   string `json:"updatedAt"`
	Private     bool   `json:"private"`
	Fork        bool   `json:"fork"`
	Archived    bool   `json:"archived"`
}

type GitHub struct {
	ctx    context.Context
	cfg    *Config
	client *http.Client

	mu       sync.Mutex
	pollStop chan struct{}
}

func NewGitHub(cfg *Config) *GitHub {
	return &GitHub{
		cfg:    cfg,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (g *GitHub) startup(ctx context.Context) {
	g.ctx = ctx
}

// ── Token ─────────────────────────────────────────────────────────────────────

func (g *GitHub) token() string {
	if g.cfg == nil {
		return ""
	}
	v := g.cfg.Get(githubTokenKey, "")
	s, _ := v.(string)
	return s
}

func (g *GitHub) IsAuthenticated() bool {
	return g.token() != ""
}

func (g *GitHub) Logout() error {
	if g.cfg == nil {
		return nil
	}
	g.cancelPolling()
	if err := g.cfg.Reset(githubTokenKey); err != nil {
		return err
	}
	emit("github.changed")
	return nil
}

func (g *GitHub) cancelPolling() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.pollStop != nil {
		close(g.pollStop)
		g.pollStop = nil
	}
}

// ── Device Flow ───────────────────────────────────────────────────────────────

// StartDeviceFlow inicia o fluxo OAuth Device Flow do GitHub.
func (g *GitHub) StartDeviceFlow() (DeviceFlowStart, error) {
	form := url.Values{}
	form.Set("client_id", githubClientID)
	form.Set("scope", "repo notifications")

	req, err := http.NewRequestWithContext(g.ctx, "POST", githubDeviceCodeURL, strings.NewReader(form.Encode()))
	if err != nil {
		return DeviceFlowStart{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := g.client.Do(req)
	if err != nil {
		return DeviceFlowStart{}, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return DeviceFlowStart{}, fmt.Errorf("github device code: %s — %s", resp.Status, strings.TrimSpace(string(body)))
	}

	var raw struct {
		DeviceCode      string `json:"device_code"`
		UserCode        string `json:"user_code"`
		VerificationURI string `json:"verification_uri"`
		ExpiresIn       int    `json:"expires_in"`
		Interval        int    `json:"interval"`
		Error           string `json:"error"`
		ErrorDesc       string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return DeviceFlowStart{}, fmt.Errorf("github device code: resposta inválida: %w", err)
	}
	if raw.Error != "" {
		return DeviceFlowStart{}, fmt.Errorf("github device code: %s — %s", raw.Error, raw.ErrorDesc)
	}
	if raw.Interval <= 0 {
		raw.Interval = 5
	}

	// Abre o navegador automaticamente para o usuário não precisar copiar a URL.
	openBrowser(raw.VerificationURI)

	return DeviceFlowStart{
		DeviceCode:      raw.DeviceCode,
		UserCode:        raw.UserCode,
		VerificationURI: raw.VerificationURI,
		Interval:        raw.Interval,
		ExpiresIn:       raw.ExpiresIn,
	}, nil
}

// PollDeviceToken faz polling até GitHub aprovar (ou expirar). Quando aprovado,
// armazena o token via Config e emite "github.changed".
func (g *GitHub) PollDeviceToken(deviceCode string, interval int) error {
	if deviceCode == "" {
		return errors.New("device_code vazio")
	}
	if interval <= 0 {
		interval = 5
	}

	g.mu.Lock()
	if g.pollStop != nil {
		close(g.pollStop)
	}
	stop := make(chan struct{})
	g.pollStop = stop
	g.mu.Unlock()

	wait := time.Duration(interval) * time.Second
	deadline := time.Now().Add(15 * time.Minute)

	for {
		if time.Now().After(deadline) {
			return errors.New("device flow: tempo esgotado")
		}
		select {
		case <-g.ctx.Done():
			return g.ctx.Err()
		case <-stop:
			return errors.New("device flow: cancelado")
		case <-time.After(wait):
		}

		token, slowDown, pending, err := g.exchangeDeviceCode(deviceCode)
		if err != nil {
			return err
		}
		if slowDown {
			wait += 5 * time.Second
			continue
		}
		if pending {
			continue
		}
		if token != "" {
			if err := g.cfg.Set(githubTokenKey, token); err != nil {
				return err
			}
			emit("github.changed")
			g.mu.Lock()
			if g.pollStop == stop {
				g.pollStop = nil
			}
			g.mu.Unlock()
			return nil
		}
	}
}

func (g *GitHub) CancelDeviceFlow() {
	g.cancelPolling()
}

func (g *GitHub) exchangeDeviceCode(deviceCode string) (token string, slowDown, pending bool, err error) {
	form := url.Values{}
	form.Set("client_id", githubClientID)
	form.Set("device_code", deviceCode)
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:device_code")

	req, e := http.NewRequestWithContext(g.ctx, "POST", githubAccessTokenURL, strings.NewReader(form.Encode()))
	if e != nil {
		return "", false, false, e
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, e := g.client.Do(req)
	if e != nil {
		return "", false, false, e
	}
	defer resp.Body.Close()

	var raw struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if e := json.NewDecoder(resp.Body).Decode(&raw); e != nil {
		return "", false, false, fmt.Errorf("github token: resposta inválida: %w", e)
	}

	switch raw.Error {
	case "":
		return raw.AccessToken, false, false, nil
	case "authorization_pending":
		return "", false, true, nil
	case "slow_down":
		return "", true, false, nil
	default:
		return "", false, false, fmt.Errorf("github device flow: %s — %s", raw.Error, raw.ErrorDesc)
	}
}

// ── REST API ──────────────────────────────────────────────────────────────────

func (g *GitHub) apiRequest(method, path string, body any) (*http.Response, error) {
	tok := g.token()
	if tok == "" {
		return nil, errors.New("não autenticado no GitHub")
	}

	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		rdr = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(g.ctx, method, githubAPIBase+path, rdr)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return g.client.Do(req)
}

func (g *GitHub) GetUser() (GitHubUser, error) {
	resp, err := g.apiRequest("GET", "/user", nil)
	if err != nil {
		return GitHubUser{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return GitHubUser{}, fmt.Errorf("github /user: %s — %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var raw struct {
		Login       string `json:"login"`
		Name        string `json:"name"`
		AvatarURL   string `json:"avatar_url"`
		Bio         string `json:"bio"`
		Company     string `json:"company"`
		Location    string `json:"location"`
		Blog        string `json:"blog"`
		Email       string `json:"email"`
		HTMLURL     string `json:"html_url"`
		PublicRepos int    `json:"public_repos"`
		Followers   int    `json:"followers"`
		Following   int    `json:"following"`
		CreatedAt   string `json:"created_at"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return GitHubUser{}, err
	}
	return GitHubUser{
		Login: raw.Login, Name: raw.Name, AvatarURL: raw.AvatarURL,
		Bio: raw.Bio, Company: raw.Company, Location: raw.Location,
		Blog: raw.Blog, Email: raw.Email, HTMLURL: raw.HTMLURL,
		PublicRepos: raw.PublicRepos, Followers: raw.Followers,
		Following: raw.Following, CreatedAt: raw.CreatedAt,
	}, nil
}

// ListMyRepos retorna até `limit` repos do usuário ordenados por update recente.
func (g *GitHub) ListMyRepos(limit int) ([]GitHubUserRepo, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	resp, err := g.apiRequest(
		"GET",
		fmt.Sprintf("/user/repos?sort=updated&per_page=%d&affiliation=owner,collaborator", limit),
		nil,
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github /user/repos: %s — %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var raw []struct {
		Name        string `json:"name"`
		FullName    string `json:"full_name"`
		Description string `json:"description"`
		HTMLURL     string `json:"html_url"`
		CloneURL    string `json:"clone_url"`
		Language    string `json:"language"`
		Stars       int    `json:"stargazers_count"`
		Forks       int    `json:"forks_count"`
		UpdatedAt   string `json:"updated_at"`
		Private     bool   `json:"private"`
		Fork        bool   `json:"fork"`
		Archived    bool   `json:"archived"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]GitHubUserRepo, 0, len(raw))
	for _, r := range raw {
		out = append(out, GitHubUserRepo{
			Name: r.Name, FullName: r.FullName, Description: r.Description,
			HTMLURL: r.HTMLURL, CloneURL: r.CloneURL, Language: r.Language,
			Stars: r.Stars, Forks: r.Forks, UpdatedAt: r.UpdatedAt,
			Private: r.Private, Fork: r.Fork, Archived: r.Archived,
		})
	}
	return out, nil
}

// PullRequestInfo é o que devolvemos depois de criar (ou abrir) um PR.
type PullRequestInfo struct {
	Number  int    `json:"number"`
	HTMLURL string `json:"htmlUrl"`
	Title   string `json:"title"`
	State   string `json:"state"`
	Head    string `json:"head"`
	Base    string `json:"base"`
}

// CreatePullRequest abre um pull request em owner/repo do head para a base.
func (g *GitHub) CreatePullRequest(owner, repo, base, head, title, body string) (*PullRequestInfo, error) {
	if owner == "" || repo == "" || base == "" || head == "" || title == "" {
		return nil, errors.New("parâmetros incompletos para criar PR")
	}
	payload := map[string]any{
		"title": title,
		"head":  head,
		"base":  base,
		"body":  body,
	}
	resp, err := g.apiRequest("POST", "/repos/"+owner+"/"+repo+"/pulls", payload)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 201 {
		return nil, fmt.Errorf("github criar PR: %s — %s", resp.Status, strings.TrimSpace(string(bodyBytes)))
	}
	var raw struct {
		Number  int    `json:"number"`
		HTMLURL string `json:"html_url"`
		Title   string `json:"title"`
		State   string `json:"state"`
		Head    struct {
			Ref string `json:"ref"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
		} `json:"base"`
	}
	if err := json.Unmarshal(bodyBytes, &raw); err != nil {
		return nil, err
	}
	return &PullRequestInfo{
		Number:  raw.Number,
		HTMLURL: raw.HTMLURL,
		Title:   raw.Title,
		State:   raw.State,
		Head:    raw.Head.Ref,
		Base:    raw.Base.Ref,
	}, nil
}

type PullRequestSummary struct {
	Number    int    `json:"number"`
	HTMLURL   string `json:"htmlUrl"`
	Title     string `json:"title"`
	State     string `json:"state"`
	Head      string `json:"head"`
	Base      string `json:"base"`
	Author    string `json:"author"`
	AvatarURL string `json:"avatarUrl"`
	UpdatedAt string `json:"updatedAt"`
	Draft     bool   `json:"draft"`
	Body      string `json:"body"`
}

// ListPullRequests lista PRs de owner/repo. state aceita "open", "closed" ou "all".
func (g *GitHub) ListPullRequests(owner, repo, state string) ([]PullRequestSummary, error) {
	if owner == "" || repo == "" {
		return nil, errors.New("owner e repo obrigatórios")
	}
	if state == "" {
		state = "open"
	}
	resp, err := g.apiRequest(
		"GET",
		"/repos/"+owner+"/"+repo+"/pulls?state="+state+"&per_page=50&sort=updated&direction=desc",
		nil,
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github listar PRs: %s — %s", resp.Status, strings.TrimSpace(string(bodyBytes)))
	}
	var raw []struct {
		Number    int    `json:"number"`
		HTMLURL   string `json:"html_url"`
		Title     string `json:"title"`
		State     string `json:"state"`
		Body      string `json:"body"`
		Draft     bool   `json:"draft"`
		UpdatedAt string `json:"updated_at"`
		User      struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"user"`
		Head struct {
			Ref string `json:"ref"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
		} `json:"base"`
	}
	if err := json.Unmarshal(bodyBytes, &raw); err != nil {
		return nil, err
	}
	out := make([]PullRequestSummary, 0, len(raw))
	for _, r := range raw {
		out = append(out, PullRequestSummary{
			Number:    r.Number,
			HTMLURL:   r.HTMLURL,
			Title:     r.Title,
			State:     r.State,
			Head:      r.Head.Ref,
			Base:      r.Base.Ref,
			Author:    r.User.Login,
			AvatarURL: r.User.AvatarURL,
			UpdatedAt: r.UpdatedAt,
			Draft:     r.Draft,
			Body:      r.Body,
		})
	}
	return out, nil
}

// PullRequestDetail traz os dados completos de um pull request individual.
type PullRequestDetail struct {
	PullRequestSummary
	HeadSHA             string `json:"headSha"`
	BaseSHA             string `json:"baseSha"`
	HeadRepoFullName    string `json:"headRepoFullName"`
	Merged              bool   `json:"merged"`
	Mergeable           *bool  `json:"mergeable,omitempty"`
	MergeableState      string `json:"mergeableState"`
	CommentsCount       int    `json:"commentsCount"`
	ReviewCommentsCount int    `json:"reviewCommentsCount"`
	Commits             int    `json:"commits"`
	Additions           int    `json:"additions"`
	Deletions           int    `json:"deletions"`
	ChangedFiles        int    `json:"changedFiles"`
	CreatedAt           string `json:"createdAt"`
}

// GetPullRequest busca os detalhes completos de um PR.
func (g *GitHub) GetPullRequest(owner, repo string, number int) (*PullRequestDetail, error) {
	if owner == "" || repo == "" || number <= 0 {
		return nil, errors.New("parâmetros incompletos para buscar PR")
	}
	resp, err := g.apiRequest("GET", fmt.Sprintf("/repos/%s/%s/pulls/%d", owner, repo, number), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github GET pull: %s — %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var raw struct {
		Number    int    `json:"number"`
		HTMLURL   string `json:"html_url"`
		Title     string `json:"title"`
		State     string `json:"state"`
		Body      string `json:"body"`
		Draft     bool   `json:"draft"`
		Merged    bool   `json:"merged"`
		Mergeable *bool  `json:"mergeable"`
		MergeableState string `json:"mergeable_state"`
		UpdatedAt string `json:"updated_at"`
		CreatedAt string `json:"created_at"`
		User      struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"user"`
		Head struct {
			Ref  string `json:"ref"`
			SHA  string `json:"sha"`
			Repo struct {
				FullName string `json:"full_name"`
			} `json:"repo"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
			SHA string `json:"sha"`
		} `json:"base"`
		Comments       int `json:"comments"`
		ReviewComments int `json:"review_comments"`
		Commits        int `json:"commits"`
		Additions      int `json:"additions"`
		Deletions      int `json:"deletions"`
		ChangedFiles   int `json:"changed_files"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	return &PullRequestDetail{
		PullRequestSummary: PullRequestSummary{
			Number:    raw.Number,
			HTMLURL:   raw.HTMLURL,
			Title:     raw.Title,
			State:     raw.State,
			Head:      raw.Head.Ref,
			Base:      raw.Base.Ref,
			Author:    raw.User.Login,
			AvatarURL: raw.User.AvatarURL,
			UpdatedAt: raw.UpdatedAt,
			Draft:     raw.Draft,
			Body:      raw.Body,
		},
		HeadSHA:             raw.Head.SHA,
		BaseSHA:             raw.Base.SHA,
		HeadRepoFullName:    raw.Head.Repo.FullName,
		Merged:              raw.Merged,
		Mergeable:           raw.Mergeable,
		MergeableState:      raw.MergeableState,
		CommentsCount:       raw.Comments,
		ReviewCommentsCount: raw.ReviewComments,
		Commits:             raw.Commits,
		Additions:           raw.Additions,
		Deletions:           raw.Deletions,
		ChangedFiles:        raw.ChangedFiles,
		CreatedAt:           raw.CreatedAt,
	}, nil
}

// MergePullRequest mescla um PR. method aceita "merge", "squash" ou "rebase".
// Vazio assume "merge".
func (g *GitHub) MergePullRequest(owner, repo string, number int, method string) error {
	if owner == "" || repo == "" || number <= 0 {
		return errors.New("parâmetros incompletos para mesclar PR")
	}
	switch method {
	case "", "merge", "squash", "rebase":
	default:
		return fmt.Errorf("merge_method inválido: %q", method)
	}
	if method == "" {
		method = "merge"
	}
	payload := map[string]any{"merge_method": method}
	resp, err := g.apiRequest("PUT", fmt.Sprintf("/repos/%s/%s/pulls/%d/merge", owner, repo, number), payload)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return fmt.Errorf("github merge PR: %s — %s", resp.Status, strings.TrimSpace(string(body)))
	}
	return nil
}

// IssueComment é um comentário de timeline (não atrelado ao diff).
type IssueComment struct {
	ID        int64  `json:"id"`
	Body      string `json:"body"`
	Author    string `json:"author"`
	AvatarURL string `json:"avatarUrl"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
	HTMLURL   string `json:"htmlUrl"`
}

// ListIssueComments lista comentários da timeline do PR (a API trata PR como issue).
func (g *GitHub) ListIssueComments(owner, repo string, number int) ([]IssueComment, error) {
	if owner == "" || repo == "" || number <= 0 {
		return nil, errors.New("parâmetros incompletos")
	}
	resp, err := g.apiRequest("GET",
		fmt.Sprintf("/repos/%s/%s/issues/%d/comments?per_page=100", owner, repo, number), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github listar comentários: %s — %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var raw []struct {
		ID        int64  `json:"id"`
		Body      string `json:"body"`
		HTMLURL   string `json:"html_url"`
		CreatedAt string `json:"created_at"`
		UpdatedAt string `json:"updated_at"`
		User      struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"user"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]IssueComment, 0, len(raw))
	for _, c := range raw {
		out = append(out, IssueComment{
			ID:        c.ID,
			Body:      c.Body,
			Author:    c.User.Login,
			AvatarURL: c.User.AvatarURL,
			CreatedAt: c.CreatedAt,
			UpdatedAt: c.UpdatedAt,
			HTMLURL:   c.HTMLURL,
		})
	}
	return out, nil
}

// CreateIssueComment publica um comentário na timeline do PR.
func (g *GitHub) CreateIssueComment(owner, repo string, number int, body string) (*IssueComment, error) {
	if owner == "" || repo == "" || number <= 0 || strings.TrimSpace(body) == "" {
		return nil, errors.New("parâmetros incompletos para comentar")
	}
	resp, err := g.apiRequest("POST",
		fmt.Sprintf("/repos/%s/%s/issues/%d/comments", owner, repo, number),
		map[string]any{"body": body})
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 201 {
		return nil, fmt.Errorf("github comentar: %s — %s", resp.Status, strings.TrimSpace(string(rb)))
	}
	var raw struct {
		ID        int64  `json:"id"`
		Body      string `json:"body"`
		HTMLURL   string `json:"html_url"`
		CreatedAt string `json:"created_at"`
		UpdatedAt string `json:"updated_at"`
		User      struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rb, &raw); err != nil {
		return nil, err
	}
	return &IssueComment{
		ID: raw.ID, Body: raw.Body, Author: raw.User.Login,
		AvatarURL: raw.User.AvatarURL, CreatedAt: raw.CreatedAt,
		UpdatedAt: raw.UpdatedAt, HTMLURL: raw.HTMLURL,
	}, nil
}

// PullRequestReview representa uma review submetida (approve / request changes / comment).
type PullRequestReview struct {
	ID          int64  `json:"id"`
	Body        string `json:"body"`
	State       string `json:"state"`
	Author      string `json:"author"`
	AvatarURL   string `json:"avatarUrl"`
	SubmittedAt string `json:"submittedAt"`
	HTMLURL     string `json:"htmlUrl"`
	CommitID    string `json:"commitId"`
}

// ListReviews lista reviews do PR.
func (g *GitHub) ListReviews(owner, repo string, number int) ([]PullRequestReview, error) {
	if owner == "" || repo == "" || number <= 0 {
		return nil, errors.New("parâmetros incompletos")
	}
	resp, err := g.apiRequest("GET",
		fmt.Sprintf("/repos/%s/%s/pulls/%d/reviews?per_page=100", owner, repo, number), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github listar reviews: %s — %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var raw []struct {
		ID          int64  `json:"id"`
		Body        string `json:"body"`
		State       string `json:"state"`
		HTMLURL     string `json:"html_url"`
		SubmittedAt string `json:"submitted_at"`
		CommitID    string `json:"commit_id"`
		User        struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"user"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]PullRequestReview, 0, len(raw))
	for _, r := range raw {
		out = append(out, PullRequestReview{
			ID: r.ID, Body: r.Body, State: r.State,
			Author: r.User.Login, AvatarURL: r.User.AvatarURL,
			SubmittedAt: r.SubmittedAt, HTMLURL: r.HTMLURL,
			CommitID: r.CommitID,
		})
	}
	return out, nil
}

// ReviewComment é um comentário inline ancorado a uma linha do diff.
type ReviewComment struct {
	ID                  int64  `json:"id"`
	PullRequestReviewID int64  `json:"pullRequestReviewId"`
	Body                string `json:"body"`
	Path                string `json:"path"`
	Line                int    `json:"line"`
	OriginalLine        int    `json:"originalLine"`
	Side                string `json:"side"`
	DiffHunk            string `json:"diffHunk"`
	Author              string `json:"author"`
	AvatarURL           string `json:"avatarUrl"`
	CreatedAt           string `json:"createdAt"`
	UpdatedAt           string `json:"updatedAt"`
	HTMLURL             string `json:"htmlUrl"`
	CommitID            string `json:"commitId"`
	InReplyToID         int64  `json:"inReplyToId"`
}

// ListReviewComments lista comentários inline (por linha) do PR.
func (g *GitHub) ListReviewComments(owner, repo string, number int) ([]ReviewComment, error) {
	if owner == "" || repo == "" || number <= 0 {
		return nil, errors.New("parâmetros incompletos")
	}
	resp, err := g.apiRequest("GET",
		fmt.Sprintf("/repos/%s/%s/pulls/%d/comments?per_page=100", owner, repo, number), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github listar review comments: %s — %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var raw []struct {
		ID                  int64  `json:"id"`
		PullRequestReviewID int64  `json:"pull_request_review_id"`
		Body                string `json:"body"`
		Path                string `json:"path"`
		Line                int    `json:"line"`
		OriginalLine        int    `json:"original_line"`
		Side                string `json:"side"`
		DiffHunk            string `json:"diff_hunk"`
		HTMLURL             string `json:"html_url"`
		CreatedAt           string `json:"created_at"`
		UpdatedAt           string `json:"updated_at"`
		CommitID            string `json:"commit_id"`
		InReplyToID         int64  `json:"in_reply_to_id"`
		User                struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"user"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]ReviewComment, 0, len(raw))
	for _, c := range raw {
		out = append(out, ReviewComment{
			ID: c.ID, PullRequestReviewID: c.PullRequestReviewID,
			Body: c.Body, Path: c.Path, Line: c.Line,
			OriginalLine: c.OriginalLine, Side: c.Side, DiffHunk: c.DiffHunk,
			Author: c.User.Login, AvatarURL: c.User.AvatarURL,
			CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt,
			HTMLURL: c.HTMLURL, CommitID: c.CommitID,
			InReplyToID: c.InReplyToID,
		})
	}
	return out, nil
}

// PullRequestCommit representa um commit listado no PR.
type PullRequestCommit struct {
	SHA         string `json:"sha"`
	ShortSHA    string `json:"shortSha"`
	Message     string `json:"message"`
	Subject     string `json:"subject"`
	AuthorName  string `json:"authorName"`
	AuthorEmail string `json:"authorEmail"`
	AuthorLogin string `json:"authorLogin"`
	AvatarURL   string `json:"avatarUrl"`
	AuthoredAt  string `json:"authoredAt"`
	HTMLURL     string `json:"htmlUrl"`
}

// ListPullRequestCommits lista os commits incluídos no PR (ordem cronológica).
func (g *GitHub) ListPullRequestCommits(owner, repo string, number int) ([]PullRequestCommit, error) {
	if owner == "" || repo == "" || number <= 0 {
		return nil, errors.New("parâmetros incompletos")
	}
	resp, err := g.apiRequest("GET",
		fmt.Sprintf("/repos/%s/%s/pulls/%d/commits?per_page=100", owner, repo, number), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github listar commits: %s — %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var raw []struct {
		SHA     string `json:"sha"`
		HTMLURL string `json:"html_url"`
		Commit  struct {
			Message string `json:"message"`
			Author  struct {
				Name  string `json:"name"`
				Email string `json:"email"`
				Date  string `json:"date"`
			} `json:"author"`
		} `json:"commit"`
		Author *struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"author"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]PullRequestCommit, 0, len(raw))
	for _, c := range raw {
		short := c.SHA
		if len(short) > 7 {
			short = short[:7]
		}
		subject := c.Commit.Message
		if i := strings.IndexByte(subject, '\n'); i >= 0 {
			subject = subject[:i]
		}
		login := ""
		avatar := ""
		if c.Author != nil {
			login = c.Author.Login
			avatar = c.Author.AvatarURL
		}
		out = append(out, PullRequestCommit{
			SHA: c.SHA, ShortSHA: short,
			Message: c.Commit.Message, Subject: subject,
			AuthorName: c.Commit.Author.Name, AuthorEmail: c.Commit.Author.Email,
			AuthorLogin: login, AvatarURL: avatar,
			AuthoredAt: c.Commit.Author.Date, HTMLURL: c.HTMLURL,
		})
	}
	return out, nil
}

// PullRequestFile representa um arquivo modificado no PR.
type PullRequestFile struct {
	Filename         string `json:"filename"`
	Status           string `json:"status"`
	Additions        int    `json:"additions"`
	Deletions        int    `json:"deletions"`
	Changes          int    `json:"changes"`
	Patch            string `json:"patch"`
	SHA              string `json:"sha"`
	PreviousFilename string `json:"previousFilename"`
}

// ListPullRequestFiles lista arquivos modificados (com patch unificado).
func (g *GitHub) ListPullRequestFiles(owner, repo string, number int) ([]PullRequestFile, error) {
	if owner == "" || repo == "" || number <= 0 {
		return nil, errors.New("parâmetros incompletos")
	}
	resp, err := g.apiRequest("GET",
		fmt.Sprintf("/repos/%s/%s/pulls/%d/files?per_page=100", owner, repo, number), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github listar arquivos: %s — %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var raw []struct {
		Filename         string `json:"filename"`
		Status           string `json:"status"`
		Additions        int    `json:"additions"`
		Deletions        int    `json:"deletions"`
		Changes          int    `json:"changes"`
		Patch            string `json:"patch"`
		SHA              string `json:"sha"`
		PreviousFilename string `json:"previous_filename"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]PullRequestFile, 0, len(raw))
	for _, f := range raw {
		out = append(out, PullRequestFile{
			Filename: f.Filename, Status: f.Status,
			Additions: f.Additions, Deletions: f.Deletions,
			Changes: f.Changes, Patch: f.Patch, SHA: f.SHA,
			PreviousFilename: f.PreviousFilename,
		})
	}
	return out, nil
}

// ReviewCommentInput descreve um comentário inline a ser anexado em uma review.
type ReviewCommentInput struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Side string `json:"side,omitempty"`
	Body string `json:"body"`
}

// CreateReview submete uma review no PR. event aceita APPROVE, REQUEST_CHANGES,
// COMMENT (ou vazio para review pendente). comments anexa comentários inline.
func (g *GitHub) CreateReview(owner, repo string, number int, event, body string, comments []ReviewCommentInput) (*PullRequestReview, error) {
	if owner == "" || repo == "" || number <= 0 {
		return nil, errors.New("parâmetros incompletos para review")
	}
	switch event {
	case "", "APPROVE", "REQUEST_CHANGES", "COMMENT":
	default:
		return nil, fmt.Errorf("event inválido: %s", event)
	}
	payload := map[string]any{}
	if event != "" {
		payload["event"] = event
	}
	if strings.TrimSpace(body) != "" {
		payload["body"] = body
	}
	if len(comments) > 0 {
		cs := make([]map[string]any, 0, len(comments))
		for _, c := range comments {
			if strings.TrimSpace(c.Body) == "" || c.Path == "" || c.Line <= 0 {
				continue
			}
			item := map[string]any{
				"path": c.Path,
				"line": c.Line,
				"body": c.Body,
			}
			if c.Side != "" {
				item["side"] = c.Side
			}
			cs = append(cs, item)
		}
		if len(cs) > 0 {
			payload["comments"] = cs
		}
	}
	if event == "REQUEST_CHANGES" || event == "COMMENT" {
		_, hasComments := payload["comments"]
		if strings.TrimSpace(body) == "" && !hasComments {
			return nil, errors.New("review precisa de body ou comentários inline")
		}
	}
	resp, err := g.apiRequest("POST",
		fmt.Sprintf("/repos/%s/%s/pulls/%d/reviews", owner, repo, number), payload)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github criar review: %s — %s", resp.Status, strings.TrimSpace(string(rb)))
	}
	var raw struct {
		ID          int64  `json:"id"`
		Body        string `json:"body"`
		State       string `json:"state"`
		HTMLURL     string `json:"html_url"`
		SubmittedAt string `json:"submitted_at"`
		CommitID    string `json:"commit_id"`
		User        struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rb, &raw); err != nil {
		return nil, err
	}
	return &PullRequestReview{
		ID: raw.ID, Body: raw.Body, State: raw.State,
		Author: raw.User.Login, AvatarURL: raw.User.AvatarURL,
		SubmittedAt: raw.SubmittedAt, HTMLURL: raw.HTMLURL,
		CommitID: raw.CommitID,
	}, nil
}

// CreateReviewComment cria um comentário inline solto (não atrelado a uma review).
func (g *GitHub) CreateReviewComment(owner, repo string, number int, commitID, path string, line int, side, body string) (*ReviewComment, error) {
	if owner == "" || repo == "" || number <= 0 || commitID == "" || path == "" || line <= 0 || strings.TrimSpace(body) == "" {
		return nil, errors.New("parâmetros incompletos para review comment")
	}
	if side == "" {
		side = "RIGHT"
	}
	payload := map[string]any{
		"body":      body,
		"commit_id": commitID,
		"path":      path,
		"line":      line,
		"side":      side,
	}
	resp, err := g.apiRequest("POST",
		fmt.Sprintf("/repos/%s/%s/pulls/%d/comments", owner, repo, number), payload)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 201 {
		return nil, fmt.Errorf("github review comment: %s — %s", resp.Status, strings.TrimSpace(string(rb)))
	}
	var raw struct {
		ID                  int64  `json:"id"`
		PullRequestReviewID int64  `json:"pull_request_review_id"`
		Body                string `json:"body"`
		Path                string `json:"path"`
		Line                int    `json:"line"`
		OriginalLine        int    `json:"original_line"`
		Side                string `json:"side"`
		DiffHunk            string `json:"diff_hunk"`
		HTMLURL             string `json:"html_url"`
		CreatedAt           string `json:"created_at"`
		UpdatedAt           string `json:"updated_at"`
		CommitID            string `json:"commit_id"`
		User                struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rb, &raw); err != nil {
		return nil, err
	}
	return &ReviewComment{
		ID: raw.ID, PullRequestReviewID: raw.PullRequestReviewID,
		Body: raw.Body, Path: raw.Path, Line: raw.Line, OriginalLine: raw.OriginalLine,
		Side: raw.Side, DiffHunk: raw.DiffHunk,
		Author: raw.User.Login, AvatarURL: raw.User.AvatarURL,
		CreatedAt: raw.CreatedAt, UpdatedAt: raw.UpdatedAt,
		HTMLURL: raw.HTMLURL, CommitID: raw.CommitID,
	}, nil
}

// ReplyToReviewComment responde a um comentário inline existente (mesma thread).
func (g *GitHub) ReplyToReviewComment(owner, repo string, number int, inReplyTo int64, body string) (*ReviewComment, error) {
	if owner == "" || repo == "" || number <= 0 || inReplyTo <= 0 || strings.TrimSpace(body) == "" {
		return nil, errors.New("parâmetros incompletos para resposta")
	}
	payload := map[string]any{"body": body, "in_reply_to": inReplyTo}
	resp, err := g.apiRequest("POST",
		fmt.Sprintf("/repos/%s/%s/pulls/%d/comments", owner, repo, number), payload)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 201 {
		return nil, fmt.Errorf("github reply review comment: %s — %s", resp.Status, strings.TrimSpace(string(rb)))
	}
	var raw struct {
		ID                  int64  `json:"id"`
		PullRequestReviewID int64  `json:"pull_request_review_id"`
		Body                string `json:"body"`
		Path                string `json:"path"`
		Line                int    `json:"line"`
		OriginalLine        int    `json:"original_line"`
		Side                string `json:"side"`
		DiffHunk            string `json:"diff_hunk"`
		HTMLURL             string `json:"html_url"`
		CreatedAt           string `json:"created_at"`
		UpdatedAt           string `json:"updated_at"`
		CommitID            string `json:"commit_id"`
		InReplyToID         int64  `json:"in_reply_to_id"`
		User                struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rb, &raw); err != nil {
		return nil, err
	}
	return &ReviewComment{
		ID: raw.ID, PullRequestReviewID: raw.PullRequestReviewID,
		Body: raw.Body, Path: raw.Path, Line: raw.Line, OriginalLine: raw.OriginalLine,
		Side: raw.Side, DiffHunk: raw.DiffHunk,
		Author: raw.User.Login, AvatarURL: raw.User.AvatarURL,
		CreatedAt: raw.CreatedAt, UpdatedAt: raw.UpdatedAt,
		HTMLURL: raw.HTMLURL, CommitID: raw.CommitID,
		InReplyToID: raw.InReplyToID,
	}, nil
}

// PickCloneDirectory abre o dialog nativo de seleção de pasta — útil para o
// frontend antes de chamar CloneRepo.
func (g *GitHub) PickCloneDirectory() (string, error) {
	return pickDirectory("Escolha onde clonar")
}

// CloneProgress descreve o estado de uma operação de clone em andamento.
// Emitido pelo backend via evento "github:clone-progress" para cada repositório.
type CloneProgress struct {
	CloneURL string `json:"cloneUrl"`
	Phase    string `json:"phase"`
	Percent  int    `json:"percent"`
	Done     bool   `json:"done"`
	Error    string `json:"error,omitempty"`
}

// gitProgressLine casa linhas como "Receiving objects:  45% (123/456), 1.23 MiB | ...".
var gitProgressLine = regexp.MustCompile(`^([A-Za-z][A-Za-z ]+?):\s+(\d+)%`)

// CloneRepo clona um repositório do GitHub para parentDir/name. Injeta o token
// na URL HTTPS para repositórios privados funcionarem sem prompt. Emite
// eventos "github:clone-progress" durante a operação.
func (g *GitHub) CloneRepo(cloneURL, parentDir, name string) (string, error) {
	cloneURL = strings.TrimSpace(cloneURL)
	parentDir = strings.TrimSpace(parentDir)
	name = strings.TrimSpace(name)
	if cloneURL == "" {
		return "", errors.New("URL de clone vazia")
	}
	if parentDir == "" {
		return "", errors.New("pasta de destino não informada")
	}
	if name == "" {
		return "", errors.New("nome do repositório vazio")
	}
	if strings.ContainsAny(name, `/\`) || name == "." || name == ".." {
		return "", fmt.Errorf("nome inválido: %q", name)
	}

	absParent, err := filepath.Abs(parentDir)
	if err != nil {
		return "", fmt.Errorf("caminho inválido: %w", err)
	}
	info, err := os.Stat(absParent)
	if err != nil {
		return "", fmt.Errorf("pasta de destino não acessível: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("destino não é uma pasta: %s", absParent)
	}

	dest := filepath.Join(absParent, name)
	if _, err := os.Stat(dest); err == nil {
		return "", fmt.Errorf("já existe %s", dest)
	}

	authedURL := injectTokenIntoURL(cloneURL, g.token())

	ctx := g.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	cmd := exec.CommandContext(ctx, "git", "clone", "--progress", "--", authedURL, dest)
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("git clone: %w", err)
	}

	emit("github:clone-progress", CloneProgress{CloneURL: cloneURL, Phase: "Iniciando", Percent: 0})

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("git clone: %w", err)
	}

	var errBuf bytes.Buffer
	scanner := bufio.NewScanner(stderr)
	scanner.Buffer(make([]byte, 0, 4096), 64*1024)
	// Split em \n e \r para capturar atualizações inline de progresso do git.
	scanner.Split(splitProgressLines)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		errBuf.WriteString(line)
		errBuf.WriteByte('\n')
		if m := gitProgressLine.FindStringSubmatch(line); m != nil {
			phase := strings.TrimSpace(m[1])
			percent := 0
			fmt.Sscanf(m[2], "%d", &percent)
			emit("github:clone-progress", CloneProgress{
				CloneURL: cloneURL,
				Phase:    phase,
				Percent:  percent,
			})
		}
	}

	if err := cmd.Wait(); err != nil {
		msg := strings.TrimSpace(errBuf.String())
		if tok := g.token(); tok != "" {
			msg = strings.ReplaceAll(msg, tok, "***")
		}
		if msg == "" {
			msg = err.Error()
		}
		emit("github:clone-progress", CloneProgress{
			CloneURL: cloneURL,
			Phase:    "Erro",
			Done:     true,
			Error:    msg,
		})
		return "", fmt.Errorf("git clone falhou: %s", msg)
	}

	emit("github:clone-progress", CloneProgress{
		CloneURL: cloneURL,
		Phase:    "Concluído",
		Percent:  100,
		Done:     true,
	})
	return dest, nil
}

// splitProgressLines é um SplitFunc que quebra em \n ou \r — necessário para
// capturar atualizações de progresso do git, que sobrescrevem a linha atual
// usando carriage return em vez de newline.
func splitProgressLines(data []byte, atEOF bool) (advance int, token []byte, err error) {
	if atEOF && len(data) == 0 {
		return 0, nil, nil
	}
	for i, b := range data {
		if b == '\n' || b == '\r' {
			return i + 1, data[:i], nil
		}
	}
	if atEOF {
		return len(data), data, nil
	}
	return 0, nil, nil
}

func injectTokenIntoURL(cloneURL, token string) string {
	if token == "" {
		return cloneURL
	}
	u, err := url.Parse(cloneURL)
	if err != nil || u.Scheme != "https" {
		return cloneURL
	}
	if u.User != nil {
		return cloneURL
	}
	u.User = url.UserPassword("x-access-token", token)
	return u.String()
}
