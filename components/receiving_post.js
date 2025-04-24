import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import mongoose from 'mongoose';
import axios from 'axios';
import https from "https"
import qs from "qs"
import { v4 as uuidv4 } from 'uuid';

const agent = new https.Agent({  
  rejectUnauthorized: false
});




const apiId = 21571955;
const apiHash = 'e3e614651aba0bffc9b26526a3c83914';
const SAVED_SESSION = '1AgAOMTQ5LjE1NC4xNjcuNTABu6pgBR8VHbSFv6qy6J7RY0LXrF46EXmZRlaAhuSBRanxIPF474QdTyh5jexYIrwaG6D1olCpb0SlHWr45X+ku85XRSiqFFwRuKYoU9kbpru5C8PuDkdA3fhKaYIlFjocAbD2+RLjh4PTevk9L+BhOcLj6zgzxngJF2RdPiPrl/To00xlxapAmyj1Ot9X5igqJv7GBZXlC65NEbzxiKEExzA7ZhuLpXOREwGlC4wXDFIcWRBxvT/RRe7z9OsQYkUosH1izPHYsNsoKOhufFFTZNYA295f6z6O2HZAH4XS5ws+atxp/V1K66Vim03iGzy7NdhQcW9I2npuOvToB/taS08=';
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
  klepinin: mongoose.model('klepininPost', new mongoose.Schema({
    text: String,
    date: { type: Date, default: Date.now },
    channel: String,
    channelUsername: String,
    channelId: String,
    ssilkaPost: String,
    tags: [String]
  }), 'klepinin_posts'),

  it_cifrovizaciya: mongoose.model('it_cifrovizaciyaPost', new mongoose.Schema({
    text: String,
    date: { type: Date, default: Date.now },
    channel: String,
    channelUsername: String,
    channelId: String,
    ssilkaPost: String,
    tags: [String]
  }), 'it_cifrovizaciya_posts'),

  mirera: mongoose.model('mireraPost', new mongoose.Schema({
    text: String,
    date: { type: Date, default: Date.now },
    channel: String,
    channelUsername: String,
    channelId: String,
    ssilkaPost: String,
    tags: [String]
  }), 'mirera_posts'),

  roblox: mongoose.model('robloxPost', new mongoose.Schema({
    text: String,
    date: { type: Date, default: Date.now },
    channel: String,
    channelUsername: String,
    channelId: String,
    ssilkaPost: String,
    tags: [String]
  }), 'roblox_posts'),

  ya_it_i: mongoose.model('ya_it_iPost', new mongoose.Schema({
    text: String,
    date: { type: Date, default: Date.now },
    channel: String,
    channelUsername: String,
    channelId: String,
    ssilkaPost: String,
    tags: [String]
  }), 'ya_it_iposts'),

  other: mongoose.model('OtherPost', new mongoose.Schema({
    text: String,
    date: { type: Date, default: Date.now },
    channel: String,
    channelUsername: String,
    channelId: String,
    ssilkaPost: String,
    tags: [String]
  }), 'other_posts')
};
const GIGACHAT_AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGACHAT_API_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';
const CLIENT_ID = '5ee1f6ee-f820-4866-b507-9284a63add14';
const CLIENT_SECRET = '542e33a1-b5a2-4609-837c-55f91da71525';




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


async function classifyPost(postText) {
  try {
    const token = await getGigaChatToken();
    console.log(token)
    
    const prompt = `Классифицируй пост (ответь только "klepinin", "it_cifrovizaciya", "ya_it_i", "mirera", "roblox" или "other")( "klepinin" - любое упоминание «Клепинин Павел; "it_cifrovizaciya" - "по теме: цифровизация/по теме: цифровая трансформация/по теме: ит/по теме: инновации/по теме: ии/по теме:меиавскленная в связках с ранхигс и президентская академия";"ya_it_i" - "любое упоминание «я-ИТ-ы»";"mirera" - "давай еще все про Mirera"; "roblox" - "всё про Roblox в связке с вуз и образование"; "other" - "всё не по таме"; ):

  Пост: "${postText.substring(0, 500)}"`;
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
    return ['klepinin', 'it_cifrovizaciya', 'ya_it_i', 'mirera', 'roblox'].includes(classification) ? classification : 'other';
  } catch (error) {
    if (error.response?.status === 401 && retries > 0) {
      return classifyPost(postText, retries - 1);
    }
    console.error('⚠️ Ошибка классификации:', error.response?.data || error.message);
    return 'other';
  }
}


async function savePost(postData) {
  try {
    const postType = await classifyPost(postData.text);
    await new PostModels[postType](postData).save();
    console.log(`💾 Сохранено в ${postType}_posts`);
  } catch (error) {
    console.error('⚠️ Ошибка сохранения:', error);
  }
}

export async function main() {
  try {
    await mongoose.connect('mongodb+srv://vladmorozov2020:Nevskifront208@moroz.gjylj0v.mongodb.net/telegram?retryWrites=true&w=majority&appName=Moroz');
    console.log('✅ Подключено к MongoDB');

    const client = new TelegramClient(new StringSession(SAVED_SESSION), apiId, apiHash, {
      connectionRetries: 5,
    });

    await client.connect();
    console.log('✅ Авторизован через сессию');


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
  
        await savePost({
          text: msg.message,
          channel: channel.title,
          channelUsername: channel.username,
          channelId: channel.id,
          ssilkaPost: `https://t.me/${channel.username}/${msg.id}`
        });
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

