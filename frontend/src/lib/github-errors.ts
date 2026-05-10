import { extractErrorMessage } from "@/lib/git";

export interface GithubErrorAction {
  label: string;
  url: string;
}

export interface GithubErrorInfo {
  message: string;
  hint?: string;
  action?: GithubErrorAction;
}

export function describeGithubError(e: unknown): GithubErrorInfo {
  const raw = extractErrorMessage(e);

  const orgRestriction = raw.match(
    /the\s+`?([\w-]+)`?\s+organization\s+has\s+enabled\s+OAuth\s+App\s+access\s+restrictions/i,
  );
  if (orgRestriction) {
    const org = orgRestriction[1];
    return {
      message: `A organização ${org} restringe acesso de apps OAuth.`,
      hint: "Um admin da org precisa autorizar o Stash, ou você pode solicitar acesso pela página de aplicativos conectados do GitHub.",
      action: {
        label: "Abrir configurações no GitHub",
        url: "https://github.com/settings/connections/applications",
      },
    };
  }

  if (/Bad credentials/i.test(raw) || /401/i.test(raw)) {
    return {
      message: "Credenciais inválidas — refaça o login do GitHub.",
    };
  }

  if (/rate limit/i.test(raw) || /API rate limit exceeded/i.test(raw)) {
    return {
      message: "Limite de requisições do GitHub atingido. Tente novamente em alguns minutos.",
    };
  }

  if (/Not Found/i.test(raw) && /404/i.test(raw)) {
    return {
      message: "Recurso não encontrado no GitHub (404). O repositório pode ser privado ou ter sido movido.",
    };
  }

  return { message: raw };
}

export function translatePrCreateError(e: unknown, base: string, head: string): string {
  const raw = extractErrorMessage(e);
  const info = describeGithubError(e);
  if (info.action || info.hint) return info.message;
  if (/no commits between/i.test(raw)) {
    return `Sem commits entre ${base} e ${head}. Faça um commit novo (ou troque a base) antes de abrir o PR.`;
  }
  if (/A pull request already exists/i.test(raw)) {
    return `Já existe um pull request aberto de ${head} para ${base}.`;
  }
  if (/head sha can't be blank/i.test(raw) || /Invalid Reference/i.test(raw)) {
    return `Branch ${head} não foi encontrada no GitHub. Faça push antes de abrir o PR.`;
  }
  if (/Validation Failed/i.test(raw)) {
    return raw.replace(/^.*?— /, "");
  }
  return raw;
}
