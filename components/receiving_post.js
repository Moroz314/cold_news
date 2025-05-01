import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import UserTheme from '../Them_model.js';
import mongoose from 'mongoose';
import axios from 'axios';
import https from "https";
import qs from "qs";
import { v4 as uuidv4 } from 'uuid';
import { bot } from '../index.js';

const agent = new https.Agent({  
  rejectUnauthorized: false
});

// Конфигурационные константы
const apiId = 21571955;
const apiHash = 'e3e614651aba0bffc9b26526a3c83914';

const SAVED_SESSION = '1AgAOMTQ5LjE1NC4xNjcuNTEBu615Dwi4/cWGjCutGJ/pSqglfbdS6IHFzZt6pbdInGjqU6zuGoOCAr36JdkTTq6QctRrx+isG4yttszsS4yt057dOzRvd5STOyvjUnrZC9kNm0gq2Yq2O3yVCZSU/rvkx9wjPDZiFeU5EWAmxgLnQZ2lxVobUHLWdbH6Q4RYvUmiJhmG5X91FL57lbApalg9xLOrwjyTtcWBtjFVxsfJjfThJ+dc1zRWjtuxgA1W/pzqgWn28+IpmRIFc1JmSiaLBnMTjamFdhfTEruaKtkybbM4pHhyOPUWyvlJBBvMpfibS9MgmSozSpjxsdPkXgFuXWAFd9KtQ8X3QpsfmXwe1hc=';
//const SAVED_SESSION = '1AgAOMTQ5LjE1NC4xNjcuNTEBu0p0tVucDIJqlzop5XB+3rNc+FBKZBx/6YYjUTM08lCVByWtRjouSf6qLSBhFs0WmL3RNBwlUSd/nhbs9VPBKtqrMuzQT+hrEHQirPklG/vJKAP/z8jjm9z0NLB2J2Ax/FIVOmwirv8Pg6pRcsFRDvg0cwXoRLcn4F9eCvZi5u3hwPPcMRHR8Snl79jgcBvTWgmWWe+eHuihix44LPjKL8kqvDsd/mdf/b0ddEDpT4I+4tlg+fzjEOVRhsIKJScfR+PVhBhbrKXJOqJDFD+4gqopqJ31ACAt00tcbJQExgEpZOcNQ0+VJ/2MdPHcbD4gX8QYDHmeKZwTlaGly1tcAeo=';
const CHANNELS_TO_MONITOR = [
  'testtest314',
  'test333234',
  'akomissarov2022',
  'mainranepa',
  'gspmranepa',
  'Emit_ranepa',
  'CDTOonline',
  'pers_conf'
];

// Модель данных
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

// GigaChat API конфигурация
const GIGACHAT_AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGACHAT_API_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';
const CLIENT_ID = '5ee1f6ee-f820-4866-b507-9284a63add14';
const CLIENT_SECRET = 'fb8ebde0-8ec4-44e3-81b7-f06f2d15ade0';

let gigaChatToken = null;
let tokenExpiration = 0;

// Глобальные переменные для управления подключением
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

async function classifyPost(postText, allThemes, retries = 3) {
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const token = await getGigaChatToken();

    const prompt = `Проанализируй новостной пост и определи, к каким темам из списка он относится.
      Список тем: ${allThemes.join(", ")}.
      Ответ должен быть в формате: "тема1, тема2, тема3".
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
    // Проверяем, не обрабатывали ли мы уже этот пост
    const postKey = `${postData.channelId}_${postData.ssilkaPost}`;
    if (processedPosts.has(postKey)) {
      console.log(`Пост уже обработан: ${postKey}`);
      return;
    }
    
    // Помечаем пост как обработанный
    processedPosts.set(postKey, true);
    
    // Остальной код функции savePost без изменений
    const postThemes = await classifyPost(postData.text, allThemes);
    console.log("Извлечённые темы:", postThemes);

    postData.tema = postThemes;
    const savedPost = await new PostModels.post_news(postData).save();

    const notificationThemes = postThemes;

    const subscribedUsers = await UserTheme.find({
      themes: { 
        $in: notificationThemes
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

    // Удаляем предыдущий обработчик, если он был
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