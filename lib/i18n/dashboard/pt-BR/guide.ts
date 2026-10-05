/**
 * The GUIDE in Brazilian Portuguese: the help menu, the FAQ, the guided tour
 * and the tour step texts for every screen, plus the competitive-research
 * screen strings that close the dictionary.
 *
 * Register as set out in chrome.ts.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { researchCompetitivePtBR } from '../research-competitive'

export const guidePtBR: DeepPartial<DashboardDictionary> = {
  guide: {
    label: 'Guia',
    menuLabel: 'Guia e ajuda',
    fullTour: 'Conhecer todo o aplicativo',
    fullTourMeta: '2 min',
    screenTour: 'Conhecer esta tela',
    screenTourNone: 'Esta tela ainda não tem um tour',
    faq: 'Perguntas frequentes',
    whatsapp: 'Fale com a gente pelo WhatsApp',
    whatsappMessage: 'Olá, preciso de ajuda',
    opensNewTab: '(abre em uma nova aba)',
    back: 'Voltar',
    faqItems: {
      project: {
        q: 'O que é um projeto?',
        a: 'Um projeto é um site, com seu próprio painel, suas palavras-chave e suas configurações. Troque de projeto no seletor na parte superior da tela.',
      },
      moreProjects: {
        q: 'Como adiciono outro site?',
        a: 'No seletor acima, escolha “Novo projeto”. Quantos projetos você pode ter depende do seu plano, e o seletor avisa quando você chega ao limite.',
      },
      rankings: {
        q: 'Quando as posições no Google são verificadas?',
        a: 'Você pode configurar um projeto para ser verificado todo mês e também pode iniciar uma verificação quando quiser, na tela de Palavras-chave. Cada verificação conta no limite do seu plano.',
      },
      volumes: {
        q: 'De onde vêm os volumes de busca?',
        a: 'Dos dados do Google Ads. São médias mensais estimadas, não uma contagem exata de buscas.',
      },
      ai: {
        q: 'O que a visibilidade em IA verifica?',
        a: 'Fazemos a motores de IA, como o ChatGPT, as perguntas que os clientes fazem e verificamos se o seu negócio é mencionado ou citado nas respostas.',
      },
      publishing: {
        q: 'Como publico artigos no meu site?',
        a: 'Nas configurações do projeto, em Conexões, conecte a plataforma do seu site. Depois de conectada, você publica os artigos direto pelo aplicativo.',
      },
    },
    tour: {
      label: 'Tour guiado',
      stepOf: (n: number, total: number) => `${n} de ${total}`,
      next: 'Próximo',
      back: 'Voltar',
      skip: 'Pular',
      done: 'Concluir',
      close: 'Fechar o tour',
      keysHint: 'Use as setas para avançar e Esc para fechar',
    },
    steps: {
      switcher: { title: 'Troque de site aqui', body: 'Cada site é um projeto. Escolha um aqui ou abra um novo.' },
      hero: { title: 'Sua situação num relance', body: 'Suas palavras-chave no Google, o que mudou e o próximo passo.' },
      research: { title: 'O que seus clientes procuram', body: 'Ideias de palavras-chave com volume de busca e concorrência, a partir de dados do Google Ads.' },
      keywords: { title: 'Onde você está hoje', body: 'A posição de cada palavra-chave no Google e o que mudou desde a última verificação.' },
      strategy: { title: 'O que escrever e quando', body: 'Temas de artigos, quando cada um será escrito e por quê.' },
      aiVisibility: { title: 'O ChatGPT cita você?', body: 'Verificamos se os motores de IA mencionam o seu negócio ao responder às perguntas dos clientes.' },
      connections: { title: 'Conecte seu site para publicar', body: 'Nas configurações do projeto, em Conexões, vincule seu site para publicar artigos, e o Google Search Console.' },
      guide: { title: 'Volte aqui quando quiser', body: 'Tours, perguntas frequentes e um chat com a gente pelo WhatsApp.' },
      start: { title: 'Comece por aqui', body: 'Alguns passos que enchem este painel com dados do seu site. Cada um abre a tela onde ele é feito.' },
      dashboardHero: { title: 'O que está acontecendo no site', body: 'O número grande resume suas palavras-chave no Google; abaixo, o que mudou e o próximo passo.' },
      dashboardShortcuts: { title: 'Atalhos', body: 'As telas que você mais visita, a um clique.' },
      researchHeader: { title: 'Pesquisa de palavras-chave', body: 'Ideias de palavras-chave, volumes de busca, concorrência e custo por clique estimado, a partir de dados do Google Ads.' },
      researchForm: { title: 'Comece por aqui', body: 'Digite uma palavra-chave ou o endereço de um site e adicione ao projeto as ideias que fizerem sentido.' },
      keywordsHeader: { title: 'Onde você está hoje', body: 'A posição de cada palavra-chave no Google e o que mudou desde a última verificação. Aqui você também adiciona palavras-chave e inicia verificações.' },
      strategyHeader: { title: 'O que escrever e quando', body: 'Temas de artigos, quando cada um será escrito e por quê.' },
      aiHeader: { title: 'O ChatGPT cita você?', body: 'Fazemos aos motores de IA as perguntas dos clientes e verificamos se o seu negócio é mencionado ou citado nas respostas.' },
      settingsHeader: { title: 'Configurações do projeto', body: 'Os dados do seu negócio, com os quais são construídos a pesquisa de palavras-chave, as análises e o conteúdo.' },
      settingsConnections: { title: 'Conecte seu site', body: 'A plataforma do seu site para publicar artigos e o Google Search Console para ter dados reais de busca.' },
      reportsHeader: { title: 'Relatórios', body: 'Relatórios sobre suas posições no Google e sua visibilidade em IA, para o projeto que você escolheu.' },
      contentHeader: { title: 'Seu conteúdo', body: 'Todos os artigos em um só lugar: ideias, o que já foi escrito e o que está programado para publicação.' },
      siteHealthHeader: { title: 'Saúde do site', body: 'O lado técnico do seu site: títulos, links quebrados e as falhas que custam posições.' },
      siteHealthFixes: { title: 'Corrigimos por você', body: 'Alguns desses problemas nós mesmos corrigimos no seu site, assim que você aprovar.' },
      siteLinksHeader: { title: 'A rede de links', body: 'Links de outros sites da nossa rede, que reforçam sua posição no Google.' },
      siteLinksOptIn: { title: 'Participar é decisão sua', body: 'A rede vem desativada por padrão. Você entra site por site e pode sair quando quiser.' },
      mapsPostsHeader: { title: 'Publicações no Google Maps', body: 'Publique novidades no seu perfil de empresa do Google direto daqui.' },
      billingHeader: { title: 'Sua assinatura', body: 'Seu plano, o que ele inclui e os pagamentos realizados.' },
      billingPlan: { title: 'Seu plano', body: 'Quantos artigos e quantos sites ele cobre, e quando começa o próximo ciclo.' },
      projectScope: { title: 'Cada projeto, seus próprios dados', body: 'Esta tela mostra o projeto escolhido aqui; ao trocá-lo, ela se atualiza sem você sair.' },
    },
  },
  researchCompetitive: researchCompetitivePtBR,
}

export {}
