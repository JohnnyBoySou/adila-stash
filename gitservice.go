package main

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/utils/merkletrie"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type GitService struct {
	mu    sync.Mutex
	repos map[string]*git.Repository
}

func NewGitService() *GitService {
	return &GitService{repos: map[string]*git.Repository{}}
}

type RepoInfo struct {
	Path          string `json:"path"`
	Name          string `json:"name"`
	CurrentBranch string `json:"currentBranch"`
	Head          string `json:"head"`
	HasChanges    bool   `json:"hasChanges"`
}

type FileChange struct {
	Path    string `json:"path"`
	Status  string `json:"status"`
	Staged  bool   `json:"staged"`
	OldPath string `json:"oldPath,omitempty"`
}

type StatusResult struct {
	Branch    string       `json:"branch"`
	Staged    []FileChange `json:"staged"`
	Unstaged  []FileChange `json:"unstaged"`
	Untracked []FileChange `json:"untracked"`
}

type CommitInfo struct {
	Hash         string    `json:"hash"`
	ShortHash    string    `json:"shortHash"`
	Subject      string    `json:"subject"`
	Body         string    `json:"body"`
	AuthorName   string    `json:"authorName"`
	AuthorEmail  string    `json:"authorEmail"`
	AuthoredAt   time.Time `json:"authoredAt"`
	ParentHashes []string  `json:"parentHashes"`
}

type DiffResult struct {
	Path     string `json:"path"`
	OldText  string `json:"oldText"`
	NewText  string `json:"newText"`
	Status   string `json:"status"`
	IsBinary bool   `json:"isBinary"`
	// data URIs ("data:image/png;base64,...") quando o arquivo é imagem.
	// Vazios para arquivos não-imagem ou lados ausentes (added/deleted).
	OldImage string `json:"oldImage,omitempty"`
	NewImage string `json:"newImage,omitempty"`
}

type CommitFileDiff struct {
	Path     string `json:"path"`
	OldPath  string `json:"oldPath,omitempty"`
	OldText  string `json:"oldText"`
	NewText  string `json:"newText"`
	Status   string `json:"status"`
	IsBinary bool   `json:"isBinary"`
	OldImage string `json:"oldImage,omitempty"`
	NewImage string `json:"newImage,omitempty"`
}

type CommitDiffResult struct {
	Hash    string           `json:"hash"`
	Parent  string           `json:"parent,omitempty"`
	Subject string           `json:"subject"`
	Files   []CommitFileDiff `json:"files"`
}

type BranchInfo struct {
	Name      string `json:"name"`
	Hash      string `json:"hash"`
	IsCurrent bool   `json:"isCurrent"`
	Upstream  string `json:"upstream,omitempty"`
}

type RemoteInfo struct {
	URL    string `json:"url"`
	Host   string `json:"host"`
	Owner  string `json:"owner"`
	Name   string `json:"name"`
	IsGitHub bool `json:"isGitHub"`
}

func (s *GitService) repoFor(path string) (*git.Repository, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.repos[path]; ok {
		return r, nil
	}
	r, err := git.PlainOpen(path)
	if err != nil {
		return nil, fmt.Errorf("opening repo at %q: %w", path, err)
	}
	s.repos[path] = r
	return r, nil
}

func (s *GitService) OpenRepo(path string) (*RepoInfo, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	r, err := s.repoFor(abs)
	if err != nil {
		return nil, err
	}
	info := &RepoInfo{Path: abs, Name: filepath.Base(abs)}

	head, err := r.Head()
	if err == nil {
		info.Head = head.Hash().String()
		if head.Name().IsBranch() {
			info.CurrentBranch = head.Name().Short()
		} else {
			info.CurrentBranch = "(detached)"
		}
	}

	wt, err := r.Worktree()
	if err == nil {
		st, err := wt.Status()
		if err == nil {
			info.HasChanges = !st.IsClean()
		}
	}
	return info, nil
}

func (s *GitService) CloseRepo(path string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.repos, path)
}

func (s *GitService) Status(path string) (*StatusResult, error) {
	r, err := s.repoFor(path)
	if err != nil {
		return nil, err
	}
	wt, err := r.Worktree()
	if err != nil {
		return nil, err
	}
	st, err := wt.Status()
	if err != nil {
		return nil, err
	}

	res := &StatusResult{Staged: []FileChange{}, Unstaged: []FileChange{}, Untracked: []FileChange{}}
	head, err := r.Head()
	if err == nil && head.Name().IsBranch() {
		res.Branch = head.Name().Short()
	}

	paths := make([]string, 0, len(st))
	for p := range st {
		paths = append(paths, p)
	}
	sort.Strings(paths)

	for _, p := range paths {
		fs := st[p]
		if fs.Staging != git.Unmodified && fs.Staging != git.Untracked {
			res.Staged = append(res.Staged, FileChange{
				Path:    p,
				Status:  statusName(fs.Staging),
				Staged:  true,
				OldPath: fs.Extra,
			})
		}
		switch fs.Worktree {
		case git.Unmodified:
		case git.Untracked:
			res.Untracked = append(res.Untracked, FileChange{Path: p, Status: "untracked"})
		default:
			res.Unstaged = append(res.Unstaged, FileChange{
				Path:    p,
				Status:  statusName(fs.Worktree),
				Staged:  false,
				OldPath: fs.Extra,
			})
		}
	}
	return res, nil
}

func statusName(c git.StatusCode) string {
	switch c {
	case git.Added:
		return "added"
	case git.Modified:
		return "modified"
	case git.Deleted:
		return "deleted"
	case git.Renamed:
		return "renamed"
	case git.Copied:
		return "copied"
	case git.Untracked:
		return "untracked"
	case git.UpdatedButUnmerged:
		return "conflict"
	default:
		return "unknown"
	}
}

func (s *GitService) StageFile(repoPath, file string) error {
	r, err := s.repoFor(repoPath)
	if err != nil {
		return err
	}
	wt, err := r.Worktree()
	if err != nil {
		return err
	}
	_, err = wt.Add(file)
	return err
}

// StageFiles adiciona vários arquivos ao index em uma única chamada ao git.
// Muito mais rápido que iterar StageFile para seleções grandes.
func (s *GitService) StageFiles(repoPath string, files []string) error {
	if len(files) == 0 {
		return nil
	}
	args := append([]string{"-C", repoPath, "add", "--"}, files...)
	cmd := exec.Command("git", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git add falhou: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

// UnstageFiles remove vários arquivos do index em uma única chamada.
func (s *GitService) UnstageFiles(repoPath string, files []string) error {
	if len(files) == 0 {
		return nil
	}
	args := append([]string{"-C", repoPath, "reset", "HEAD", "--"}, files...)
	cmd := exec.Command("git", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		// `git reset HEAD --` falha em repos sem commits; tenta `git rm --cached` como fallback
		rmArgs := append([]string{"-C", repoPath, "rm", "--cached", "--"}, files...)
		rmOut, rmErr := exec.Command("git", rmArgs...).CombinedOutput()
		if rmErr != nil {
			return fmt.Errorf("git reset falhou: %s", strings.TrimSpace(string(out)))
		}
		_ = rmOut
	}
	return nil
}

// DiscardFiles descarta as mudanças locais de vários arquivos.
// `tracked` e `untracked` são separados para usar o comando git correto.
func (s *GitService) DiscardFiles(repoPath string, trackedFiles, untrackedFiles []string) error {
	if len(trackedFiles) > 0 {
		args := append([]string{"-C", repoPath, "checkout", "--"}, trackedFiles...)
		cmd := exec.Command("git", args...)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("git checkout falhou: %s", strings.TrimSpace(string(out)))
		}
	}
	if len(untrackedFiles) > 0 {
		args := append([]string{"-C", repoPath, "clean", "-fd", "--"}, untrackedFiles...)
		cmd := exec.Command("git", args...)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("git clean falhou: %s", strings.TrimSpace(string(out)))
		}
	}
	return nil
}

func (s *GitService) UnstageFile(repoPath, file string) error {
	r, err := s.repoFor(repoPath)
	if err != nil {
		return err
	}
	wt, err := r.Worktree()
	if err != nil {
		return err
	}
	head, err := r.Head()
	if err != nil {
		// no HEAD yet — restore to empty index entry by removing
		idx, ierr := r.Storer.Index()
		if ierr != nil {
			return ierr
		}
		filtered := idx.Entries[:0]
		for _, e := range idx.Entries {
			if e.Name != file {
				filtered = append(filtered, e)
			}
		}
		idx.Entries = filtered
		return r.Storer.SetIndex(idx)
	}
	return wt.Reset(&git.ResetOptions{
		Mode:   git.MixedReset,
		Commit: head.Hash(),
		Files:  []string{file},
	})
}

func (s *GitService) Commit(repoPath, message, authorName, authorEmail string) (string, error) {
	if strings.TrimSpace(message) == "" {
		return "", errors.New("commit message is required")
	}
	r, err := s.repoFor(repoPath)
	if err != nil {
		return "", err
	}
	wt, err := r.Worktree()
	if err != nil {
		return "", err
	}

	if authorName == "" || authorEmail == "" {
		name, email := loadGitIdentity(r)
		if authorName == "" {
			authorName = name
		}
		if authorEmail == "" {
			authorEmail = email
		}
	}
	if authorName == "" || authorEmail == "" {
		return "", errors.New("git author identity is not configured")
	}

	hash, err := wt.Commit(message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  authorName,
			Email: authorEmail,
			When:  time.Now(),
		},
	})
	if err != nil {
		return "", err
	}
	return hash.String(), nil
}

func loadGitIdentity(r *git.Repository) (name, email string) {
	if cfg, err := r.Config(); err == nil && cfg != nil {
		name = cfg.User.Name
		email = cfg.User.Email
	}
	if name != "" && email != "" {
		return
	}
	if cfg, err := config.LoadConfig(config.GlobalScope); err == nil && cfg != nil {
		if name == "" {
			name = cfg.User.Name
		}
		if email == "" {
			email = cfg.User.Email
		}
	}
	return
}

func (s *GitService) Log(repoPath string, limit int) ([]CommitInfo, error) {
	if limit <= 0 {
		limit = 100
	}
	r, err := s.repoFor(repoPath)
	if err != nil {
		return nil, err
	}
	head, err := r.Head()
	if err != nil {
		return []CommitInfo{}, nil
	}
	iter, err := r.Log(&git.LogOptions{From: head.Hash()})
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	commits := make([]CommitInfo, 0, limit)
	count := 0
	err = iter.ForEach(func(c *object.Commit) error {
		if count >= limit {
			return io.EOF
		}
		count++
		subject, body := splitMessage(c.Message)
		parents := make([]string, 0, len(c.ParentHashes))
		for _, p := range c.ParentHashes {
			parents = append(parents, p.String())
		}
		commits = append(commits, CommitInfo{
			Hash:         c.Hash.String(),
			ShortHash:    c.Hash.String()[:7],
			Subject:      subject,
			Body:         body,
			AuthorName:   c.Author.Name,
			AuthorEmail:  c.Author.Email,
			AuthoredAt:   c.Author.When,
			ParentHashes: parents,
		})
		return nil
	})
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}
	return commits, nil
}

func splitMessage(msg string) (subject, body string) {
	msg = strings.TrimRight(msg, "\n")
	if idx := strings.Index(msg, "\n"); idx >= 0 {
		return strings.TrimSpace(msg[:idx]), strings.TrimSpace(msg[idx+1:])
	}
	return strings.TrimSpace(msg), ""
}

func (s *GitService) ListBranches(repoPath string) ([]BranchInfo, error) {
	r, err := s.repoFor(repoPath)
	if err != nil {
		return nil, err
	}
	head, _ := r.Head()
	currentName := ""
	if head != nil && head.Name().IsBranch() {
		currentName = head.Name().Short()
	}

	cfg, _ := r.Config()

	iter, err := r.Branches()
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	out := []BranchInfo{}
	err = iter.ForEach(func(ref *plumbing.Reference) error {
		name := ref.Name().Short()
		bi := BranchInfo{
			Name:      name,
			Hash:      ref.Hash().String(),
			IsCurrent: name == currentName,
		}
		if cfg != nil {
			if branchCfg, ok := cfg.Branches[name]; ok && branchCfg != nil && branchCfg.Remote != "" && branchCfg.Merge != "" {
				bi.Upstream = branchCfg.Remote + "/" + plumbing.ReferenceName(branchCfg.Merge).Short()
			}
		}
		out = append(out, bi)
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (s *GitService) Checkout(repoPath, branchName string) error {
	r, err := s.repoFor(repoPath)
	if err != nil {
		return err
	}
	wt, err := r.Worktree()
	if err != nil {
		return err
	}
	status, err := wt.Status()
	if err != nil {
		return err
	}
	if !status.IsClean() {
		return errors.New("a árvore de trabalho tem alterações não commitadas")
	}
	return wt.Checkout(&git.CheckoutOptions{
		Branch: plumbing.NewBranchReferenceName(branchName),
	})
}

func (s *GitService) CreateBranch(repoPath, name string, checkout bool) error {
	if strings.TrimSpace(name) == "" {
		return errors.New("nome da branch vazio")
	}
	r, err := s.repoFor(repoPath)
	if err != nil {
		return err
	}
	head, err := r.Head()
	if err != nil {
		return fmt.Errorf("HEAD inacessível: %w", err)
	}
	refName := plumbing.NewBranchReferenceName(name)
	if _, err := r.Reference(refName, false); err == nil {
		return fmt.Errorf("branch %q já existe", name)
	}
	ref := plumbing.NewHashReference(refName, head.Hash())
	if err := r.Storer.SetReference(ref); err != nil {
		return err
	}
	if checkout {
		wt, err := r.Worktree()
		if err != nil {
			return err
		}
		return wt.Checkout(&git.CheckoutOptions{Branch: refName})
	}
	return nil
}

// StashPush salva alterações locais no stash. Usa o git binário do sistema
// para suporte completo a stash (go-git ainda não suporta).
func (s *GitService) StashPush(repoPath, message string) error {
	args := []string{"-C", repoPath, "stash", "push", "--include-untracked"}
	if strings.TrimSpace(message) != "" {
		args = append(args, "-m", message)
	}
	cmd := exec.Command("git", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git stash falhou: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

// StashPop reaplica o stash mais recente e o remove da pilha.
func (s *GitService) StashPop(repoPath string) error {
	cmd := exec.Command("git", "-C", repoPath, "stash", "pop")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git stash pop falhou: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

// DiscardLocalChanges descarta TODAS as alterações locais (tracked) e remove
// arquivos não-rastreados. Operação destrutiva — só deve ser chamada após
// confirmação explícita do usuário.
func (s *GitService) DiscardLocalChanges(repoPath string) error {
	reset := exec.Command("git", "-C", repoPath, "reset", "--hard", "HEAD")
	if out, err := reset.CombinedOutput(); err != nil {
		return fmt.Errorf("git reset falhou: %s", strings.TrimSpace(string(out)))
	}
	clean := exec.Command("git", "-C", repoPath, "clean", "-fd")
	if out, err := clean.CombinedOutput(); err != nil {
		return fmt.Errorf("git clean falhou: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

// DiscardFile descarta as mudanças locais de um arquivo:
//   - tracked (modificado/deletado): `git checkout -- <file>`
//   - untracked: remove o arquivo do disco via `git clean -f -- <file>`
func (s *GitService) DiscardFile(repoPath, file string, untracked bool) error {
	if strings.TrimSpace(file) == "" {
		return errors.New("nome do arquivo vazio")
	}
	if untracked {
		cmd := exec.Command("git", "-C", repoPath, "clean", "-fd", "--", file)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("git clean falhou: %s", strings.TrimSpace(string(out)))
		}
		return nil
	}
	cmd := exec.Command("git", "-C", repoPath, "checkout", "--", file)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git checkout falhou: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

// Push publica a branch local em origin com -u. Usa o git binário do sistema
// para aproveitar credential helpers e SSH config.
func (s *GitService) Push(repoPath, branchName string) error {
	if strings.TrimSpace(branchName) == "" {
		return errors.New("nome da branch vazio")
	}
	cmd := exec.Command("git", "-C", repoPath, "push", "-u", "origin", branchName)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git push falhou: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

type AheadBehind struct {
	Ahead  int `json:"ahead"`
	Behind int `json:"behind"`
}

// AheadBehind compara duas refs (ex.: head="feature", base="main") usando
// `git rev-list --left-right --count base...head`. Retorna quantos commits
// `head` está à frente de `base` (Ahead) e atrás (Behind).
func (s *GitService) AheadBehind(repoPath, base, head string) (*AheadBehind, error) {
	if strings.TrimSpace(base) == "" || strings.TrimSpace(head) == "" {
		return nil, errors.New("base e head obrigatórios")
	}
	spec := base + "..." + head
	cmd := exec.Command("git", "-C", repoPath, "rev-list", "--left-right", "--count", spec)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("git rev-list falhou: %s", strings.TrimSpace(string(out)))
	}
	parts := strings.Fields(strings.TrimSpace(string(out)))
	if len(parts) != 2 {
		return nil, fmt.Errorf("saída inesperada: %q", string(out))
	}
	behind, err := strconv.Atoi(parts[0])
	if err != nil {
		return nil, err
	}
	ahead, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil, err
	}
	return &AheadBehind{Ahead: ahead, Behind: behind}, nil
}

func (s *GitService) RemoteInfo(repoPath string) (*RemoteInfo, error) {
	r, err := s.repoFor(repoPath)
	if err != nil {
		return nil, err
	}
	remote, err := r.Remote("origin")
	if err != nil {
		return nil, err
	}
	urls := remote.Config().URLs
	if len(urls) == 0 {
		return nil, errors.New("origin sem URLs")
	}
	url := urls[0]
	host, owner, name := parseRemoteURL(url)
	return &RemoteInfo{
		URL:      url,
		Host:     host,
		Owner:    owner,
		Name:     name,
		IsGitHub: strings.EqualFold(host, "github.com"),
	}, nil
}

func parseRemoteURL(url string) (host, owner, name string) {
	u := url
	u = strings.TrimSuffix(u, ".git")
	if strings.HasPrefix(u, "git@") {
		// git@github.com:owner/repo
		rest := strings.TrimPrefix(u, "git@")
		parts := strings.SplitN(rest, ":", 2)
		if len(parts) == 2 {
			host = parts[0]
			pp := strings.SplitN(parts[1], "/", 2)
			if len(pp) == 2 {
				owner, name = pp[0], pp[1]
			}
		}
		return
	}
	if i := strings.Index(u, "://"); i >= 0 {
		u = u[i+3:]
	}
	if i := strings.Index(u, "@"); i >= 0 {
		u = u[i+1:]
	}
	pp := strings.SplitN(u, "/", 3)
	if len(pp) >= 3 {
		host = pp[0]
		owner = pp[1]
		name = pp[2]
	}
	return
}

// FileDiff returns the contents of a file in HEAD vs. the working tree (or the
// index, if staged). The frontend renders the diff itself.
func (s *GitService) FileDiff(repoPath, file string, staged bool) (*DiffResult, error) {
	r, err := s.repoFor(repoPath)
	if err != nil {
		return nil, err
	}

	res := &DiffResult{Path: file}

	headText, headFound, err := readBlobAtHead(r, file)
	if err != nil {
		return nil, err
	}

	if staged {
		text, found, err := readBlobAtIndex(r, file)
		if err != nil {
			return nil, err
		}
		res.OldText = headText
		res.NewText = text
		res.Status = statusFromBoth(headFound, found)
		if mime := imageMime(file); mime != "" {
			res.IsBinary = true
			res.OldText = ""
			res.NewText = ""
			if headFound {
				res.OldImage = dataURI(mime, []byte(headText))
			}
			if found {
				res.NewImage = dataURI(mime, []byte(text))
			}
		} else if isBinary([]byte(text)) || isBinary([]byte(headText)) {
			res.IsBinary = true
			res.OldText = ""
			res.NewText = ""
		}
	} else {
		fullPath := filepath.Join(repoPath, file)
		data, err := os.ReadFile(fullPath)
		if err != nil && !os.IsNotExist(err) {
			return nil, err
		}
		newText := string(data)
		newFound := err == nil
		res.OldText = headText
		res.NewText = newText
		res.Status = statusFromBoth(headFound, newFound)
		if mime := imageMime(file); mime != "" {
			res.IsBinary = true
			res.OldText = ""
			res.NewText = ""
			if headFound {
				res.OldImage = dataURI(mime, []byte(headText))
			}
			if newFound {
				res.NewImage = dataURI(mime, data)
			}
		} else if isBinary(data) {
			res.IsBinary = true
			res.OldText = ""
			res.NewText = ""
		}
	}
	return res, nil
}

func statusFromBoth(oldFound, newFound bool) string {
	switch {
	case !oldFound && newFound:
		return "added"
	case oldFound && !newFound:
		return "deleted"
	default:
		return "modified"
	}
}

func readBlobAtHead(r *git.Repository, file string) (string, bool, error) {
	head, err := r.Head()
	if err != nil {
		return "", false, nil
	}
	commit, err := r.CommitObject(head.Hash())
	if err != nil {
		return "", false, err
	}
	tree, err := commit.Tree()
	if err != nil {
		return "", false, err
	}
	entry, err := tree.File(file)
	if err != nil {
		if errors.Is(err, object.ErrFileNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	contents, err := entry.Contents()
	if err != nil {
		return "", false, err
	}
	return contents, true, nil
}

func readBlobAtIndex(r *git.Repository, file string) (string, bool, error) {
	idx, err := r.Storer.Index()
	if err != nil {
		return "", false, err
	}
	for _, e := range idx.Entries {
		if e.Name == file {
			obj, err := r.BlobObject(e.Hash)
			if err != nil {
				return "", false, err
			}
			rc, err := obj.Reader()
			if err != nil {
				return "", false, err
			}
			defer rc.Close()
			var buf bytes.Buffer
			if _, err := io.Copy(&buf, rc); err != nil {
				return "", false, err
			}
			return buf.String(), true, nil
		}
	}
	return "", false, nil
}

// CommitDiff returns per-file diffs for a commit, compared against its first
// parent (or the empty tree for root commits). Merge commits are diffed against
// the first parent only.
func (s *GitService) CommitDiff(repoPath, hash string) (*CommitDiffResult, error) {
	r, err := s.repoFor(repoPath)
	if err != nil {
		return nil, err
	}

	commit, err := r.CommitObject(plumbing.NewHash(hash))
	if err != nil {
		return nil, fmt.Errorf("commit %q: %w", hash, err)
	}

	commitTree, err := commit.Tree()
	if err != nil {
		return nil, err
	}

	var (
		parentTree *object.Tree
		parentHash string
	)
	if commit.NumParents() > 0 {
		parent, err := commit.Parent(0)
		if err != nil {
			return nil, err
		}
		parentTree, err = parent.Tree()
		if err != nil {
			return nil, err
		}
		parentHash = parent.Hash.String()
	}

	changes, err := object.DiffTree(parentTree, commitTree)
	if err != nil {
		return nil, err
	}

	files := make([]CommitFileDiff, 0, len(changes))
	for _, ch := range changes {
		action, err := ch.Action()
		if err != nil {
			return nil, err
		}

		entry := CommitFileDiff{}

		fromFile, toFile, err := ch.Files()
		if err != nil {
			return nil, err
		}

		switch action {
		case merkletrie.Insert:
			entry.Path = ch.To.Name
			entry.Status = "added"
		case merkletrie.Delete:
			entry.Path = ch.From.Name
			entry.Status = "deleted"
		case merkletrie.Modify:
			entry.Path = ch.To.Name
			if ch.From.Name != ch.To.Name {
				entry.OldPath = ch.From.Name
				entry.Status = "renamed"
			} else {
				entry.Status = "modified"
			}
		}

		oldText, oldBin, err := blobText(fromFile)
		if err != nil {
			return nil, err
		}
		newText, newBin, err := blobText(toFile)
		if err != nil {
			return nil, err
		}

		if mime := imageMime(entry.Path); mime != "" {
			entry.IsBinary = true
			if fromFile != nil {
				raw, err := blobBytes(fromFile)
				if err != nil {
					return nil, err
				}
				entry.OldImage = dataURI(mime, raw)
			}
			if toFile != nil {
				raw, err := blobBytes(toFile)
				if err != nil {
					return nil, err
				}
				entry.NewImage = dataURI(mime, raw)
			}
		} else if oldBin || newBin {
			entry.IsBinary = true
		} else {
			entry.OldText = oldText
			entry.NewText = newText
		}

		files = append(files, entry)
	}

	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })

	return &CommitDiffResult{
		Hash:    commit.Hash.String(),
		Parent:  parentHash,
		Subject: strings.SplitN(commit.Message, "\n", 2)[0],
		Files:   files,
	}, nil
}

// PickRepoFolder abre um seletor nativo de diretório e devolve o caminho
// escolhido. Retorna ("", nil) se o usuário cancelar.
func (s *GitService) PickRepoFolder() (string, error) {
	app := application.Get()
	if app == nil {
		return "", errors.New("aplicação Wails não inicializada")
	}

	dialog := app.Dialog.OpenFile().
		CanChooseFiles(false).
		CanChooseDirectories(true).
		CanCreateDirectories(false).
		SetTitle("Selecionar repositório Git")

	path, err := dialog.PromptForSingleSelection()
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil
	}

	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}

	if _, err := os.Stat(filepath.Join(abs, ".git")); err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("a pasta selecionada não é um repositório Git: %s", abs)
		}
		return "", err
	}

	return abs, nil
}

// blobBytes lê o conteúdo bruto do blob como []byte. Necessário para arquivos
// binários (imagens) onde precisamos da representação byte-a-byte para gerar
// data URIs.
func blobBytes(f *object.File) ([]byte, error) {
	if f == nil {
		return nil, nil
	}
	rc, err := f.Reader()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	var buf bytes.Buffer
	if _, err := io.Copy(&buf, rc); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func blobText(f *object.File) (string, bool, error) {
	if f == nil {
		return "", false, nil
	}
	bin, err := f.IsBinary()
	if err != nil {
		return "", false, err
	}
	if bin {
		return "", true, nil
	}
	contents, err := f.Contents()
	if err != nil {
		return "", false, err
	}
	return contents, false, nil
}

// imageMimes mapeia extensões para mime types renderizáveis em <img>. SVG é
// texto, mas costuma fazer sentido visualizar a versão renderizada também.
var imageMimes = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".gif":  "image/gif",
	".webp": "image/webp",
	".bmp":  "image/bmp",
	".ico":  "image/x-icon",
	".svg":  "image/svg+xml",
	".avif": "image/avif",
}

func imageMime(path string) string {
	return imageMimes[strings.ToLower(filepath.Ext(path))]
}

func dataURI(mime string, data []byte) string {
	if mime == "" || len(data) == 0 {
		return ""
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
}

func isBinary(data []byte) bool {
	if len(data) == 0 {
		return false
	}
	check := data
	if len(check) > 8000 {
		check = check[:8000]
	}
	return bytes.IndexByte(check, 0) >= 0
}
