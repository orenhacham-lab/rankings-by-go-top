import { Metadata } from 'next'
import { Award, FileSpreadsheet, Lightbulb, LineChart, Link2, MessagesSquare, Sparkles, Target, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingPtBR } from '@/lib/i18n/public/landing-pt-BR'

export const metadata: Metadata = {
  title: 'Acompanhamento da visibilidade em IA | Go Top SEO',
  description: 'Acompanhe as menções ao seu negócio no ChatGPT, Gemini, Perplexity e Google AI. Meça o seu GEO, a otimização para mecanismos generativos.',
  alternates: {
    canonical: 'https://www.gotopseo.com/pt-BR/features/ai-visibility-tracking',
    languages: buildHreflangAlternates('/features/ai-visibility-tracking', '/en/features/ai-visibility-tracking', '/es/features/ai-visibility-tracking'),
  },
}

export default function AIVisibilityFeaturePage() {
  return <FeaturePage locale="pt-BR" content={CONTENT} />
}

const C = FEATURE_COMMON['pt-BR']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Visibilidade nos mecanismos de IA',
    eyebrowIcon: Sparkles,
    title: 'Quando um cliente pergunta ao ChatGPT,',
    accent: 'saiba se ele recomenda você',
    subtitle: 'A plataforma faz ao ChatGPT, Gemini, Perplexity, Copilot, Grok e Google AI as perguntas que os seus clientes fazem, e mostra quem aparece na resposta: você ou um concorrente.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <AiVisual copy={landingPtBR.features.ai.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Por que isso importa agora',
      title: 'Tem cliente que já não busca no Google. Pergunta para a IA.',
      intro: 'Quem aparece na resposta leva a recomendação. Quem não aparece fica fora da conversa.',
      items: [
        { icon: MessagesSquare, title: 'A pergunta foi para o chat', body: 'Em vez de passar por dez resultados, a pessoa faz uma pergunta e recebe uma resposta com poucos nomes. Um deles deveria ser o seu.' },
        { icon: Award, title: 'Uma recomendação em que as pessoas acreditam', body: 'Quando um mecanismo de IA menciona uma empresa, soa como uma indicação. O cliente que chega assim já chega decidido.' },
        { icon: Target, title: 'Seus concorrentes talvez já estejam lá', body: 'Sem conferir, não há como saber quem eles recomendam no seu setor. O acompanhamento mostra isso pergunta por pergunta e mecanismo por mecanismo.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Como funciona',
      title: 'Três passos para ter o quadro claro',
      items: [
        { title: 'Escolha as perguntas', body: 'A plataforma sugere perguntas a partir das palavras-chave do seu negócio, e você adiciona ou remove. Por exemplo: "Quem instala ar-condicionado em São Paulo?"' },
        { title: 'Cada mecanismo é consultado separadamente', body: 'Cada pergunta vai para os seis mecanismos, e cada resposta é lida e verificada.' },
        { title: 'Veja quem entra', body: 'Para cada pergunta: se mencionaram você, se o seu site foi citado como fonte e quem foi mencionado no seu lugar.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'O que você recebe',
      title: 'Tudo de que você precisa para entrar na resposta',
      items: [
        { icon: Sparkles, title: 'Menções por mecanismo', body: 'Em cada um dos seis mecanismos separadamente, porque cada um responde de um jeito.' },
        { icon: Link2, title: 'Citado como fonte', body: 'Se a resposta aponta para o seu site como fonte, e não só para o seu nome.' },
        { icon: Users, title: 'Quem é mencionado no seu lugar', body: 'Os concorrentes que aparecem nas respostas, e as perguntas em que eles levam a recomendação.' },
        { icon: Lightbulb, title: 'O que melhorar', body: 'Recomendações sobre o que adicionar ou mudar no seu site para ter mais chance de estar na resposta.' },
        { icon: LineChart, title: 'Tendências ao longo do tempo', body: 'Cada verificação é guardada, assim você vê se a visibilidade sobe quando artigos são publicados.' },
        { icon: FileSpreadsheet, title: 'Relatórios em PDF e Excel', body: 'Menções e citações por mecanismo, em um relatório que você pode enviar a um cliente ou ao seu chefe.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Perguntas',
      title: 'O que se pergunta sobre a visibilidade em IA',
      items: [
        { q: 'Qual a diferença entre SEO e GEO?', a: 'SEO é aparecer nos resultados do Google. GEO é aparecer nas respostas dos mecanismos de IA. A plataforma mede os dois, e os artigos que ela escreve são pensados para os dois: estrutura clara e seções de perguntas, além de dados estruturados em sites WordPress com o plugin da Go Top.' },
        { q: 'Vocês garantem que vamos aparecer nas respostas?', a: 'Não. Ninguém controla o que um mecanismo de IA responde. O que fazemos: medir exatamente onde você está, mostrar quem aparece no seu lugar e criar conteúdo que aumenta as suas chances.' },
        { q: 'Como é contada uma verificação de IA?', a: 'Uma pergunta em um mecanismo é uma verificação. A mesma pergunta nos seis mecanismos são seis verificações. A cota de cada plano está na página de preços.' },
      ],
    },
  ],
  cta: {
    title: 'Descubra o que o ChatGPT diz sobre o seu setor',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
