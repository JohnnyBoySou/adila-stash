import { useMemo, useState } from "react";

import { Logo } from "@/components/Logo";
import { Mascot } from "@/components/Mascot";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const JOKES = [
  "— Por que o programador atravessou a rua?\n— Pra fazer um commit do outro lado.",
  "Existem 10 tipos de pessoas: as que entendem binário e as que não.",
  "Em produção, todo bug é uma feature em estado de negação.",
  "git push --force é o `rm -rf` dos relacionamentos profissionais.",
  'Disse o code review pro PR: "Não é você, sou eu". O PR respondeu: "LGTM 🚀".',
  "Dizem que TODO é eterno, mas o // FIXME que diga.",
  "Stack Overflow tá fora do ar? Volta pra cama, hoje não vai dar.",
  "— Cadê o bug?\n— Em algum lugar entre o teclado e a cadeira.",
  "Café é só o garbage collector do programador.",
  "Eu não tenho bugs. Tenho features espontâneas.",
  "main branch é tipo cozinha de mãe: ninguém entra de chinelo sujo.",
  "Refactoring: a arte de quebrar três coisas pra arrumar uma.",
  "Dark mode não é tema, é estilo de vida.",
  '"Funciona na minha máquina" é o mantra mais sagrado da TI.',
  "Toda regex parece magia até você ter que ler ela depois.",
  "— Você manja de recursão?\n— Pra entender recursão, primeiro você precisa manjar de recursão.",
  "Programador não dorme. Faz hot reload da consciência.",
  "Documentação é tipo academia: todo mundo acha importante, ninguém vai.",
  'Diz a lenda que existe um dev que escreveu testes antes do código. Mas é só lenda.',
  "JavaScript me ensinou que `0 == \"0\"` mas `0 == \"\"` também. E que confiança é frágil.",
  "Por que devs preferem dark mode? Porque luz atrai bugs.",
  "Estimativa de prazo é tipo previsão do tempo: ninguém acredita, mas todo mundo pergunta.",
  '— "É rapidinho?"\n— Nada que envolva data e fuso horário é rapidinho.',
  "CSS é a única linguagem em que `!important` é tanto solução quanto problema.",
  "Reuniões podiam ter sido um e-mail. E-mails podiam ter sido um commit.",
  "— Quantos devs pra trocar uma lâmpada?\n— Nenhum, é problema de hardware.",
  "Toda vez que alguém escreve `// magic`, um stagiaire chora em algum lugar.",
  "Deploy na sexta? Só se você quiser virar o oncall do fim de semana.",
  "Senior é o dev que já apagou o banco de produção pelo menos uma vez.",
  '— "Tá funcionando?"\n— Tá. Mas não pergunte por quê.',
  "Pair programming: dois cérebros, um teclado, três opiniões.",
  "Kubernetes é fácil. Eu só preciso de mais 47 YAMLs.",
  "Em 2026, ainda existem dois tipos de bug: os do `npm install` e os de fuso horário.",
  "— Como você organiza o código?\n— Pelo nível de vergonha em ordem decrescente.",
  "Se você não escreveu testes, o usuário escreve por você. Em produção.",
  "Toda branch `wip-final-final-2` esconde uma história de sofrimento.",
  "Tabs vs spaces? A briga de verdade é sobre quem mexeu no .editorconfig.",
  "DevOps: porque precisávamos de mais um chapéu pra usar de uma vez só.",
  "Microsserviço é monolito com mais latência e contas de cloud maiores.",
  "Não é flaky test. É um teste com personalidade.",
  "— Cadê a documentação?\n— No Slack. Nos DMs. De alguém que saiu da empresa.",
  "Cache é a raiz de todos os bugs. Os outros são timezone.",
  "Toda variável `tmp` se torna permanente quando ninguém olha.",
  '— "Quem fez esse código horrível?"\n*git blame*\n— Ah… fui eu. Em 2024.',
  "Reescrever do zero é tipo divórcio: parece mais fácil até começar.",
  "Linter não é seu inimigo. Ele só é incrivelmente sincero.",
];

function pickJoke(): string {
  return JOKES[Math.floor(Math.random() * JOKES.length)];
}

export function StashiButton() {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState(0);
  const joke = useMemo(() => pickJoke(), [seed]);

  function handleOpenChange(next: boolean) {
    if (next) setSeed((s) => s + 1);
    setOpen(next);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent"
        title="Falar com o Stashi"
      >
        <Logo className="size-6" alt="Stashi" />
        <span className="font-medium">Stashi</span>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader className="items-center">
            <DialogTitle className="sr-only">Stashi</DialogTitle>
            <DialogDescription className="sr-only">
              Uma piada do Stashi, o mascote do Stash.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <Mascot
              size="md"
              glitchIntervalMs={70}
              glitchIntensity={4}
              className="scale-110"
            />
            <p className="max-w-[32ch] whitespace-pre-line text-center text-[12px] text-foreground">
              {joke}
            </p>
            <button
              type="button"
              onClick={() => setSeed((s) => s + 1)}
              className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Conta outra
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
