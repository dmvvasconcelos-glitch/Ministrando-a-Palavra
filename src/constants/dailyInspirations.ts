export interface Verse {
  ref: string;
  text: string;
}

export const DAILY_VERSES: Record<string, Verse[]> = {
  pt: [
    { ref: 'João 3:16', text: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.' },
    { ref: 'Salmos 23:1', text: 'O Senhor é o meu pastor; nada me faltará.' },
    { ref: 'Filipenses 4:13', text: 'Tudo posso naquele que me fortalece.' },
    { ref: 'Josué 1:9', text: 'Não fui eu que lhe ordenei? Seja forte e corajoso! Não se apavore, nem se desanime, pois o Senhor, o seu Deus, estará com você por onde você andar.' },
    { ref: 'Romanos 8:28', text: 'Sabemos que todas as coisas cooperam para o bem daqueles que amam a Deus, daqueles que são chamados segundo o seu propósito.' },
    { ref: 'Isaías 40:31', text: 'Mas aqueles que esperam no Senhor renovam as suas forças. Voam alto como águias; correm e não ficam exaustos, caminham e não se cansam.' },
    { ref: 'Mateus 11:28', text: 'Venham a mim, todos os que estão cansados e sobrecarregados, e eu lhes darei descanso.' },
  ],
  en: [
    { ref: 'John 3:16', text: 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.' },
    { ref: 'Psalm 23:1', text: 'The Lord is my shepherd, I lack nothing.' },
    { ref: 'Philippians 4:13', text: 'I can do all this through him who gives me strength.' },
    { ref: 'Joshua 1:9', text: 'Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.' },
    { ref: 'Romans 8:28', text: 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.' },
    { ref: 'Isaiah 40:31', text: 'But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.' },
    { ref: 'Matthew 11:28', text: 'Come to me, all you who are weary and burdened, and I will give you rest.' },
  ],
  es: [
    { ref: 'Juan 3:16', text: 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.' },
    { ref: 'Salmos 23:1', text: 'Jehová es mi pastor; nada me faltará.' },
    { ref: 'Filipenses 4:13', text: 'Todo lo puedo en Cristo que me fortalece.' },
    { ref: 'Josué 1:9', text: 'Mira que te mando que te esfuerces y seas valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo en dondequiera que vayas.' },
    { ref: 'Romanos 8:28', text: 'Y sabemos que a los que aman a Dios, todas las cosas les ayudan a bien, esto es, a los que conforme a su propósito son llamados.' },
    { ref: 'Isaías 40:31', text: 'Pero los que esperan a Jehová tendrán nuevas fuerzas; levantarán alas como las águilas; correrán, y no se cansarán; caminarán, y no se fatigarán.' },
    { ref: 'Mateus 11:28', text: 'Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar.' },
  ]
};

export const DAILY_REFLECTIONS: Record<string, string[]> = {
  pt: [
    "A fé não torna as coisas fáceis, ela as torna possíveis.",
    "Deus não nos dá o que queremos, Ele nos dá o que precisamos.",
    "A oração é a chave que abre as portas do céu.",
    "Onde há amor, há Deus.",
    "A gratidão transforma o que temos em suficiente.",
    "A paciência é a virtude dos fortes.",
    "Perdoar é libertar um prisioneiro e descobrir que o prisioneiro era você.",
  ],
  en: [
    "Faith doesn't make things easy, it makes them possible.",
    "God doesn't give us what we want, He gives us what we need.",
    "Prayer is the key that opens heaven's doors.",
    "Where there is love, there is God.",
    "Gratitude turns what we have into enough.",
    "Patience is the virtue of the strong.",
    "To forgive is to set a prisoner free and discover that the prisoner was you.",
  ],
  es: [
    "La fe no hace que las cosas sean fáciles, las hace posibles.",
    "Dios no nos da lo que queremos, Él nos da lo que necesitamos.",
    "La oración es la llave que abre las puertas del cielo.",
    "Donde hay amor, hay Dios.",
    "La gratitud transforma lo que tenemos en suficiente.",
    "La paciencia es la virtud de los fuertes.",
    "Perdonar es liberar a un prisionero y descubrir que el prisionero eras tú.",
  ]
};

export const MINISTERIAL_TIPS: Record<string, Verse[]> = {
  pt: [
    { ref: '2 Timóteo 2:15', text: 'Procure apresentar-se a Deus aprovado, como obreiro que não tem do que se envergonhar e que maneja bem a palavra da verdade.' },
    { ref: '1 Pedro 5:2', text: 'Pastoreiem o rebanho de Deus que está aos seus cuidados. Olhem por ele, não por obrigação, mas de livre vontade, como Deus quer.' },
    { ref: 'Atos 20:24', text: 'Todavia, não me importo, nem considero a minha vida de valor algum para mim mesmo, se tão-somente puder concluir a minha carreira e o ministério que recebi do Senhor Jesus.' },
    { ref: 'Colossenses 4:17', text: 'Atente para o ministério que você recebeu no Senhor, para segui-lo fielmente.' },
    { ref: '1 Timóteo 4:12', text: 'Ninguém o despreze por você ser jovem, mas seja um exemplo para os fiéis na palavra, no procedimento, no amor, na fé e na pureza.' },
  ],
  en: [
    { ref: '2 Timothy 2:15', text: 'Do your best to present yourself to God as one approved, a worker who does not need to be ashamed and who correctly handles the word of truth.' },
    { ref: '1 Peter 5:2', text: 'Be shepherds of God’s flock that is under your care, watching over them—not because you must, but because you are willing, as God wants you to be.' },
    { ref: 'Acts 20:24', text: 'However, I consider my life worth nothing to me; my only aim is to finish the race and complete the task the Lord Jesus has given me.' },
    { ref: 'Colossians 4:17', text: 'See to it that you complete the ministry you have received in the Lord.' },
    { ref: '1 Timothy 4:12', text: 'Don’t let anyone look down on you because you are young, but set an example for the believers in speech, in conduct, in love, in faith and in purity.' },
  ],
  es: [
    { ref: '2 Timoteo 2:15', text: 'Procura con diligencia presentarte a Dios aprobado, como obrero que no tiene de qué avergonzarse, que usa bien la palabra de verdad.' },
    { ref: '1 Pedro 5:2', text: 'Apacentad la grey de Dios que está entre vosotros, cuidando de ella, no por fuerza, sino voluntariamente; no por ganancia deshonesta, sino con ánimo pronto.' },
    { ref: 'Hechos 20:24', text: 'Pero de ninguna cosa hago caso, ni estimo preciosa mi vida para mí mismo, con tal que acabe mi carrera con gozo, y el ministerio que recibí del Señor Jesús.' },
    { ref: 'Colosenses 4:17', text: 'Mira que cumplas el ministerio que recibiste en el Señor.' },
    { ref: '1 Timoteo 4:12', text: 'Ninguno tenga en poco tu juventud, sino sé ejemplo de los creyentes en palabra, conducta, amor, espíritu, fe y pureza.' },
  ]
};
