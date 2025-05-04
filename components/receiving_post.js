import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl/index.js';
import { StringSession } from 'telegram/sessions/index.js';
import UserTheme from '../Them_model.js';
import mongoose from 'mongoose';
import axios from 'axios';
import https from "https";
import qs from "qs";
import { v4 as uuidv4 } from 'uuid';
import { bot } from '../index.js';
import dotenv from 'dotenv';

dotenv.config();

const agent = new https.Agent({  
  rejectUnauthorized: false
});


const apiId = 21571955;
const apiHash = process.env.apiHash;;

const SAVED_SESSION = process.env.SAVED_SESSION_serv
//const SAVED_SESSION = process.env.SAVED_SESSION_test


export const PostModels = {
  post_news: mongoose.model('newsPost', new mongoose.Schema({
    text: String,
    date: { type: Date, default: Date.now },
    channel: String,
    channelUsername: String,
    channelId: String,
    ssilkaPost: String,
    tema: {  
      type: [String],
      required: true,
      index: true  
    },
    tags: [String]
  }), 'news_posts'),
};


const GIGACHAT_AUTH_URL = process.env.GIGACHAT_AUTH_URL
const GIGACHAT_API_URL = process.env.GIGACHAT_API_URL
const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET =process.env.CLIENT_SECRET

let gigaChatToken = null;
let tokenExpiration = 0;


let clientInstance = null;
let isMonitoring = false;

async function getGigaChatToken() {
  if (gigaChatToken && Date.now() < tokenExpiration) {
    return gigaChatToken;
  }

  try {
    const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const response = await axios.post(
      GIGACHAT_AUTH_URL,
      qs.stringify({ scope: 'GIGACHAT_API_B2B' }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'RqUID': uuidv4(),
          'Authorization': `Basic ${authString}`
        },
        httpsAgent: agent
      }
    );
    
    gigaChatToken = response.data.access_token;
    tokenExpiration = Date.now() + (response.data.expires_in * 1000) - 60000;
    return gigaChatToken;
  } catch (error) {
    console.error('⚠️ Ошибка получения токена:', error.response?.data || error.message);
    throw error;
  }
}

export async function searchChannel(query, limit=10){
  try {
    const result = await client.invoke(
      new Api.contacts.Search({
        q: query,
        limit: limit
      })
    )

    return result.chats.filter(chat => chat.className === 'Channel')
  } catch (error) {
    console.error('Ошибка поиска:', error);
    throw error;
  }
}

async function classifyPost(postText, allThemes, retries = 3) {
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const token = await getGigaChatToken();

    const prompt = `Проанализируй новостной пост и определи, к каким темам из списка он относится. 
      Учитывай не только прямое упоминание темы, но и смежные области. Вот примеры соответствий:
      
      * Искусственный интеллект:
        - "ChatGPT", "Gemini", "Copilot" → "искусственный интеллект"
        - "нейросети", "машинное обучение", "LLM" → "искусственный интеллект"
        - "генеративный ИИ", "трансформеры", "дипфейки" → "искусственный интеллект"
      
      * Криптовалюты:
        - "биткоин", "эфириум", "солана" → "криптовалюты"
        - "блокчейн", "DeFi", "NFT" → "криптовалюты"
        - "майнинг", "стейкинг", "криптобиржи" → "криптовалюты"
      
      * Медицина:
        - "COVID", "вакцина", "эпидемия" → "медицина"
        - "ДНК", "гены", "биотехнологии" → "медицина"
        - "операция", "лекарство", "FDA" → "медицина"
      
      * Политика:
        - "выборы", "президент", "парламент" → "политика"
        - "санкции", "дипломатия", "ООН" → "политика"
        - "законопроект", "лоббирование", "импичмент" → "политика"
      
      * Экономика:
        - "инфляция", "ВВП", "безработица" → "экономика"
        - "акции", "рынок", "инвестиции" → "экономика"
        - "кризис", "рецессия", "биржа" → "экономика"
      
      Список всех возможных тем: ${allThemes.join(", ")}.
      
      Ответ должен содержать ТОЛЬКО подходящие темы в формате: "тема1, тема2, тема3".
      Если пост не подходит ни к одной теме, напиши "другое".
      
      Текст поста:
      "${postText.substring(0, 500)}"`;

    const response = await axios.post(
      GIGACHAT_API_URL,
      {
        model: 'GigaChat-Pro',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 50
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        httpsAgent: agent,
        timeout: 5000
      }
    );

    const responseText = response.data.choices[0].message.content.trim();
    const matchedThemes = responseText
      .split(",")
      .map(theme => theme.trim().toLowerCase())
      .filter(theme => allThemes.includes(theme));
    console.log(matchedThemes, 'awefawef')

    return matchedThemes.length > 0 ? matchedThemes : ["другое"];
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      return classifyPost(postText, allThemes, retries - 1);
    }
    console.error('⚠️ Ошибка классификации:', error.response?.data || error.message);
    return ["другое"];
  }
}

export async function tgk_predl (tema) {
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const token = await getGigaChatToken();

    const prompt = `Ты — эксперт по поиску Telegram-каналов. Я даю тебе тему — твоя задача найти максимальное количество релевантных публичных Telegram-каналов по этой теме и предоставить их в следующем формате:

Формат ответа:
Название канала (t.me/ссылка)

    Краткое описание (язык, количество подписчиков*, основная тематика)

    Последние обсуждаемые темы (если известно)

Пример:
Startup Universe (t.me/startup_universe)

    Англоязычный канал о стартапах (50K+ подписчиков)

    Последние посты: разбор pitch-дек, кейсы привлечения инвестиций

Требования:

    Только публичные каналы (формат ссылки: t.me/username)

    Если каналов много — выбери ТОП-20 по популярности/актуальности

    Если данных о подписчиках нет — пропускай этот пункт

    Если каналов нет — предложи альтернативные темы для поиска

Моя тема: [${tema}]`;

    const response = await axios.post(
      GIGACHAT_API_URL,
      {
        model: 'GigaChat-Pro',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 50
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        httpsAgent: agent,
        timeout: 5000
      }
    );

    const responseText = response.data.choices[0].message.content.trim();
     console.log(responseText)

    return responseText;
  } catch (error) {
    console.log(error)
  }
}

const processedPosts = new Map();

async function savePost(postData, allThemes) {
  try {

    const postKey = `${postData.channelId}_${postData.ssilkaPost}`;
    if (processedPosts.has(postKey)) {
      console.log(`Пост уже обработан: ${postKey}`);
      return;
    }
    

    processedPosts.set(postKey, true);
    

    const postThemes = await classifyPost(postData.text, allThemes);
    console.log("Извлечённые темы:", postThemes);

    postData.tema = postThemes;

    const savedPost = await new PostModels.post_news(postData).save();

    const notificationThemes = postThemes;
    const chanlsubscribe = postData.channelUsername


    const subscribedUsers = await UserTheme.find({
      themes: { 
        $in: notificationThemes
      },
      channles : { 
        $in: chanlsubscribe
      }
    });


    for (const user of subscribedUsers) {
      try {
        const userMatchedThemes = user.themes.filter(theme => 
          notificationThemes.includes(theme)
        );

        const themesText = userMatchedThemes.join(", ");
        
        await bot.sendMessage(
          user.telegramId,
          `📢 <b>Новый пост по теме: ${themesText}</b>\n` +
          `<b>Канал:</b> ${postData.channel}\n` +
          `<b>Текст:</b> ${postData.text.substring(0, 100)}...\n\n` +
          `🏷️ <i>Теги: ${notificationThemes.join(', ')}</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "🔗 Открыть пост", url: postData.ssilkaPost },
                  { 
                    text: "🔕 Отключить уведомления", 
                    callback_data: `disable_${userMatchedThemes.join('|')}`
                  }
                ]
              ]
            }
          }
        );
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(`📨 Уведомление отправлено ${user.telegramId} по темам: ${themesText}`);
      } catch (err) {
        console.error(`Ошибка отправки пользователю ${user.telegramId}:`, err.message);
      }
    }

    console.log(`💾 Сохранён пост: "${postData.text.substring(0, 30)}..." с темами: ${postThemes.join(', ')}`);
    
    // Очищаем старые записи, чтобы не накапливать память
    if (processedPosts.size > 1000) {
      const oldestKey = processedPosts.keys().next().value;
      processedPosts.delete(oldestKey);
    }
  } catch (error) {
    console.error('⚠️ Ошибка сохранения:', error);
  }
}

function formatThemesText(themes) {
  if (themes.length === 1) return themes[0];
  
  const last = themes.pop();
  return `${themes.join(', ')} и ${last}`;
}

async function initializeClient() {
  if (clientInstance) return clientInstance;

  const client = new TelegramClient(new StringSession(SAVED_SESSION), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();
  console.log('✅ Авторизован через сессию');
  clientInstance = client;
  return client;
}


export const client = await initializeClient();

export async function updateChannelsList() {
    const allChanle = await UserTheme.distinct('channles');

    return allChanle
}

let eventHandler = null;

export async function startMonitoring() {
  try {

    isMonitoring = true;
    const allChanle = await updateChannelsList();
    console.log(allChanle);

    const channelsInfo = {};
    for (const username of allChanle) {
      try {
        const channel = await client.getEntity(username);
        channelsInfo[channel.id.toString()] = {
          id: channel.id,
          title: channel.title,
          username
        };
        console.log(`🔎 Канал добавлен: ${channel.title}`);
      } catch (error) {
        console.error(`⚠️ Ошибка канала ${username}:`, error);
      }
    }

 
    if (eventHandler) {
      client.removeEventHandler(eventHandler);
    }

    eventHandler = async (event) => {
      try {
        if (!['UpdateNewChannelMessage', 'UpdateNewMessage'].includes(event.className)) return;
  
        const msg = event.message;
        if (!msg.message) return;
  
        const sourceId = msg.peerId.className === 'PeerChannel' 
          ? msg.peerId.channelId.toString() 
          : msg.peerId.className === 'PeerChat' 
            ? msg.peerId.chatId.toString() 
            : null;
  
        if (!sourceId || !channelsInfo[sourceId]) return;
  
        const channel = channelsInfo[sourceId];
        console.log(`📩 Пост из ${channel.title}`);

        const allThemes = await UserTheme.distinct('themes');
        console.log(allThemes);
        
        await savePost({
          text: msg.message,
          channel: channel.title,
          channelUsername: channel.username,
          channelId: channel.id,
          ssilkaPost: `https://t.me/${channel.username}/${msg.id}`,
          tema: []
        }, allThemes);
      } catch (error) {
        console.error('⚠️ Ошибка обработки:', error);
      }
    };

    client.addEventHandler(eventHandler);
    console.log('👂 Мониторинг каналов запущен');
  } catch (err) {
    console.error('❌ Ошибка мониторинга каналов:', err);
    isMonitoring = false;
  }
}

export async function initializeUser(telegramId) {
  try {
    await mongoose.connect('mongodb+srv://vladmorozov2020:Nevskifront208@moroz.gjylj0v.mongodb.net/teleg_news?retryWrites=true&w=majority&appName=Moroz');

    const user = await UserTheme.findOne({ telegramId });
    if (!user) {
      console.log(`Создаем нового пользователя: ${telegramId}`);
      await UserTheme.create({ telegramId, themes: ['другое'] });
    }


    if (!isMonitoring) {
      await startMonitoring();
    }
  } catch (err) {
    console.error('❌ Ошибка инициализации пользователя:', err);
  }
}