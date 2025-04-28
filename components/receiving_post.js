import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import UserTheme from '../Them_model.js';
import mongoose from 'mongoose';
import axios from 'axios';
import https from "https"
import qs from "qs"
import { v4 as uuidv4 } from 'uuid';
import { sendPostNotifications } from '../index.js';

const agent = new https.Agent({  
  rejectUnauthorized: false
});




const apiId = 21571955;
const apiHash = 'e3e614651aba0bffc9b26526a3c83914';
const SAVED_SESSION = '1AgAOMTQ5LjE1NC4xNjcuNTABuzktr3gRlutiXvrP+Uq2WnVC+egTVy6PWBvl3dx5ZLt8ciWqOrSMBlB7LC/2uKsneKyLhBFvjIA4QVXjNpA7s5ERI63p92KqnMNrFTfAcoNxYVp3NVFHx9elyO2j3/Jo/blHpic6ejjjBOfF6WulAAb8nty/OEubUILl8tNOMnCowe2+hWwMsPAfOz/YnlE4bzP/idrFLIsBA/OV72UFEEQVZeXdRMQplNBpvLawz8JnGDrTPzQP5vB13cTbc6EHDLAbGLud5dXyBA1Uzewq1k/WPW/UPgghssyAqeyIB0SBStUVqiHEB8W3MCgnix0GlbRSZaI+T9NPWQj5yvrdlNw=';
const GIGACHAT_TOKEN = 'NWVlMWY2ZWUtZjgyMC00ODY2LWI1MDctOTI4NGE2M2FkZDE0OjU0MmUzM2ExLWI1YTItNDYwOS04MzdjLTU1ZjkxZGE3MTUyNQ=='

const CHANNELS_TO_MONITOR = [
  'test333234',
  'akomissarov2022',
  'mainranepa',
  'gspmranepa',
  'Emit_ranepa',
  'CDTOonline',
  'pers_conf'
];


export const PostModels = {
  post_news: mongoose.model('newsPost', new mongoose.Schema({
    text: String,
    date: { type: Date, default: Date.now },
    channel: String,
    channelUsername: String,
    channelId: String,
    ssilkaPost: String,
    tema: {  // Добавляем поле для темы
      type: String,
      required: true,
      index: true  // Индекс для быстрого поиска
    },
    tags: [String]
  }), 'news_posts'),

};
const GIGACHAT_AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGACHAT_API_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';
const CLIENT_ID = '5ee1f6ee-f820-4866-b507-9284a63add14';
const CLIENT_SECRET = 'fb8ebde0-8ec4-44e3-81b7-f06f2d15ade0';




let gigaChatToken = null;
let tokenExpiration = 0;

async function getGigaChatToken() {
  // Если токен еще действителен, возвращаем его
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
    tokenExpiration = Date.now() + (response.data.expires_in * 1000) - 60000; // -1 минута на запас
    return gigaChatToken;
  } catch (error) {
    console.error('⚠️ Ошибка получения токена:', error.response?.data || error.message);
    throw error;
  }
}


async function classifyPost(postText, tems, retries = 3) {
  try {

    await new Promise(resolve => setTimeout(resolve, 1000))

    let temms = tems
    console.log(temms)
    const token = await getGigaChatToken();
    console.log(token)
    
    const prompt = `Проанализируй следующий новостной пост и определи, к какой теме из списка ${temms} он относится. Выбери только одну наиболее подходящую тему. Ответ должен быть точным совпадением с одним из элементов списка (включая регистр и формулировку). Если пост не соответствует ни одной теме, верни "другое".  

   Текст поста:  
   "${postText.substring(0, 500)}"

    Ответ (только название темы, без пояснений, кавычек и лишних символов): `
    
    const response = await axios.post(
      GIGACHAT_API_URL,
      {
        model: 'GigaChat-Pro',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 10
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
    const classification = response.data.choices[0].message.content.trim().toLowerCase();
    console.log(classification, 'class')
    return temms.includes(classification) ? classification : 'другое';
  } catch (error) {
    if (error.response?.status === 429 && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      return classifyPost(postText, tems, retries - 1);
    }
    if (error.response?.status === 401 && retries > 0) {
      return classifyPost(postText, retries - 1);             
    }
    console.error('⚠️ Ошибка классификации:', error.response?.data || error.message);
    return 'другое';
  }
}

async function savePost(postData, userThemes, telegramBot) { // Добавлен параметр telegramBot
  try {
    const postType = await classifyPost(postData.text, userThemes);
    console.log(postType, 'postType');
    postData.tema = postType;
    await new PostModels["post_news"](postData).save();
    
    // Отправляем уведомления всем активным пользователям
    if (telegramBot) {
      sendPostNotifications(telegramBot)
      const allUsers = await UserTheme.find({});
      for (const user of allUsers) {
        if (user.themes.includes(postType)) {
          await telegramBot.sendMessage(
            user.telegramId,
            `📢 Новый пост по теме "${postType}"!\n` +
            `Канал: ${postData.channel}\n` 
            {
              reply_markup: {
                inline_keyboard: [[{text: "🔗 Открыть пост", url: postData.ssilkaPost}]]
              }
            }
          );
        }
      }
    }
    
    console.log(`💾 Сохранено с темой ${postType}_posts`);
  } catch (error) {
    console.error('⚠️ Ошибка сохранения:', error);
  }
}
export async function main(telegramId, telegramBot) {
  try {
    console.log(telegramId)
  await mongoose.connect('mongodb+srv://vladmorozov2020:Nevskifront208@moroz.gjylj0v.mongodb.net/teleg_news?retryWrites=true&w=majority&appName=Moroz')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

    const client = new TelegramClient(new StringSession(SAVED_SESSION), apiId, apiHash, {
      connectionRetries: 5,
    });

    await client.connect();
    console.log('✅ Авторизован через сессию');

    const user = await UserTheme.findOne({ telegramId: telegramId });
    if (!user) {
      console.log(`Пользователь ${telegramId} не найден, создаём нового`);
      await UserTheme.create({ telegramId, themes: ['другое'] });
    }



    const channelsInfo = {};
    for (const username of CHANNELS_TO_MONITOR) {
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
  

    client.addEventHandler(async (event) => {
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
        
        
        const userThemes = await UserTheme.findOne({ telegramId: telegramId }); // Исправлено здесь
        const themes = userThemes?.themes;

        console.log("темы:", themes)
        await savePost({
          text: msg.message,
          channel: channel.title,
          channelUsername: channel.username,
          channelId: channel.id,
          ssilkaPost: `https://t.me/${channel.username}/${msg.id}`,
          tema: ""
        }, themes, telegramBot);
      } catch (error) {
        console.error('⚠️ Ошибка обработки:', error);
      }
    });
  
    console.log('👂 Бот запущен и слушает сообщения...');
    await client.connect();
  

  } catch (err) {
    console.error('❌ Критическая ошибка:', err);
    process.exit(1);
  }
}

