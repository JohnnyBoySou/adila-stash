import { GitHub as GitHubAPI } from "../../bindings/changeme";

export interface DeviceFlowStart {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
}

export interface GitHubUser {
  login: string;
  name: string;
  avatarUrl: string;
  bio: string;
  company: string;
  location: string;
  blog: string;
  email: string;
  htmlUrl: string;
  publicRepos: number;
  followers: number;
  following: number;
  createdAt: string;
}

export interface CloneProgress {
  cloneUrl: string;
  phase: string;
  percent: number;
  done: boolean;
  error?: string;
}

export interface PullRequestInfo {
  number: number;
  htmlUrl: string;
  title: string;
  state: string;
  head: string;
  base: string;
}

export interface PullRequestSummary {
  number: number;
  htmlUrl: string;
  title: string;
  state: string;
  head: string;
  base: string;
  author: string;
  avatarUrl: string;
  updatedAt: string;
  draft: boolean;
  body: string;
}

export interface PullRequestDetail extends PullRequestSummary {
  headSha: string;
  baseSha: string;
  headRepoFullName: string;
  merged: boolean;
  mergeable: boolean | null;
  mergeableState: string;
  commentsCount: number;
  reviewCommentsCount: number;
  commits: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
}

export interface IssueComment {
  id: number;
  body: string;
  author: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface PullRequestReview {
  id: number;
  body: string;
  state: string;
  author: string;
  avatarUrl: string;
  submittedAt: string;
  htmlUrl: string;
  commitId: string;
}

export interface ReviewComment {
  id: number;
  pullRequestReviewId: number;
  body: string;
  path: string;
  line: number;
  originalLine: number;
  side: string;
  diffHunk: string;
  author: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  commitId: string;
  inReplyToId: number;
}

export interface PullRequestCommit {
  sha: string;
  shortSha: string;
  message: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authorLogin: string;
  avatarUrl: string;
  authoredAt: string;
  htmlUrl: string;
}

export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
  sha: string;
  previousFilename: string;
}

export interface ReviewCommentInput {
  path: string;
  line: number;
  side: string;
  body: string;
}

export type ReviewEvent = "" | "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export interface GitHubUserRepo {
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  cloneUrl: string;
  language: string;
  stars: number;
  forks: number;
  updatedAt: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
}

export const github = {
  isAuthenticated: () => GitHubAPI.IsAuthenticated() as unknown as Promise<boolean>,
  logout: () => GitHubAPI.Logout() as unknown as Promise<void>,
  getUser: () => GitHubAPI.GetUser() as unknown as Promise<GitHubUser>,
  startDeviceFlow: () => GitHubAPI.StartDeviceFlow() as unknown as Promise<DeviceFlowStart>,
  pollDeviceToken: (deviceCode: string, interval: number) =>
    GitHubAPI.PollDeviceToken(deviceCode, interval) as unknown as Promise<void>,
  cancelDeviceFlow: () => GitHubAPI.CancelDeviceFlow() as unknown as Promise<void>,
  listMyRepos: (limit: number) =>
    GitHubAPI.ListMyRepos(limit) as unknown as Promise<GitHubUserRepo[]>,
  pickCloneDirectory: () => GitHubAPI.PickCloneDirectory() as unknown as Promise<string>,
  cloneRepo: (cloneURL: string, parentDir: string, name: string) =>
    GitHubAPI.CloneRepo(cloneURL, parentDir, name) as unknown as Promise<string>,
  createPullRequest: (
    owner: string,
    repo: string,
    base: string,
    head: string,
    title: string,
    body: string,
  ) =>
    GitHubAPI.CreatePullRequest(owner, repo, base, head, title, body) as unknown as Promise<
      PullRequestInfo
    >,
  listPullRequests: (owner: string, repo: string, state: "open" | "closed" | "all" = "open") =>
    GitHubAPI.ListPullRequests(owner, repo, state) as unknown as Promise<PullRequestSummary[]>,
  getPullRequest: (owner: string, repo: string, number: number) =>
    GitHubAPI.GetPullRequest(owner, repo, number) as unknown as Promise<PullRequestDetail>,
  mergePullRequest: (
    owner: string,
    repo: string,
    number: number,
    method: "merge" | "squash" | "rebase" = "merge",
  ) => GitHubAPI.MergePullRequest(owner, repo, number, method) as unknown as Promise<void>,
  listIssueComments: (owner: string, repo: string, number: number) =>
    GitHubAPI.ListIssueComments(owner, repo, number) as unknown as Promise<IssueComment[]>,
  createIssueComment: (owner: string, repo: string, number: number, body: string) =>
    GitHubAPI.CreateIssueComment(owner, repo, number, body) as unknown as Promise<IssueComment>,
  listReviews: (owner: string, repo: string, number: number) =>
    GitHubAPI.ListReviews(owner, repo, number) as unknown as Promise<PullRequestReview[]>,
  listReviewComments: (owner: string, repo: string, number: number) =>
    GitHubAPI.ListReviewComments(owner, repo, number) as unknown as Promise<ReviewComment[]>,
  listPullRequestFiles: (owner: string, repo: string, number: number) =>
    GitHubAPI.ListPullRequestFiles(owner, repo, number) as unknown as Promise<PullRequestFile[]>,
  listPullRequestCommits: (owner: string, repo: string, number: number) =>
    GitHubAPI.ListPullRequestCommits(owner, repo, number) as unknown as Promise<PullRequestCommit[]>,
  createReview: (
    owner: string,
    repo: string,
    number: number,
    event: ReviewEvent,
    body: string,
    comments: ReviewCommentInput[],
  ) =>
    GitHubAPI.CreateReview(owner, repo, number, event, body, comments) as unknown as Promise<
      PullRequestReview
    >,
  createReviewComment: (
    owner: string,
    repo: string,
    number: number,
    commitId: string,
    path: string,
    line: number,
    side: string,
    body: string,
  ) =>
    GitHubAPI.CreateReviewComment(
      owner,
      repo,
      number,
      commitId,
      path,
      line,
      side,
      body,
    ) as unknown as Promise<ReviewComment>,
  replyToReviewComment: (
    owner: string,
    repo: string,
    number: number,
    inReplyTo: number,
    body: string,
  ) =>
    GitHubAPI.ReplyToReviewComment(owner, repo, number, inReplyTo, body) as unknown as Promise<
      ReviewComment
    >,
};
