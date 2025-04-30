import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram/tl/index.js';
import UserTheme from '../Them_model.js';
import mongoose from 'mongoose';
import axios from 'axios';
import https from "https";
import qs from "qs";
import { v4 as uuidv4 } from 'uuid';
import { bot } from '../index.js';
import { JSDOM } from 'jsdom';

// Конфигурация HTTPS агента
const agent = new https.Agent({  
  rejectUnauthorized: false
});

// Константы подключения Telegram
const apiId = 21571955;
const apiHash = 'e3e614651aba0bffc9b26526a3c83914';
const SAVED_SESSION = '1AgAOMTQ5LjE1NC4xNjcuNDEBu3yxAPKBDJruJ9wtcA5L5iE8oUxxk0+kCp4OUrxWVDTmxsnEcR7ppXMA56GGmkiQyOziR+syaLpkw7yLLPrUIXIHl0MRe7J5PSBbonpNCjxHie2RD0qh/hCXQedkNum8A9EXtmXbjUGiRy7DrKsbW2reICAejYJIBwF4zRisA01GuQkpZlkgNSaYuvTHQob048XpRNPsrFQeOHriz+lodLLt/6L1gMlCqckhvj/CNiFdFOQFnPh13Rfu0PiZIBnBBH/kqFcxabLjJ/o/RYOSLIXYK2/hlu0q20hHMMr+u+g74I5sLgM8lokQ+vSVk+9p90S4Ws0zEdqr+64cHzcIMpU=';

// Мониторируемые каналы
const CHANNELS_TO_MONITOR = [
  'test333234',
  'akomissarov2022',
  'mainranepa',
  'gspmranepa',
  'Emit_ranepa',
  'CDTOonline',
  'pers_conf'
];

// Модель данных MongoDB
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

// Конфигурация GigaChat API
const GIGACHAT_AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGACHAT_API_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';
const CLIENT_ID = '5ee1f6ee-f820-4866-b507-9284a63add14';
const CLIENT_SECRET = 'fb8ebde0-8ec4-44e3-81b7-f06f2d15ade0';

// Глобальные переменные
let gigaChatToken = null;
let tokenExpiration = 0;
let clientInstance = null;
let isMonitoring = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Конфигурация клиента Telegram
const clientConfig = {
  connectionRetries: 5,
  retryDelay: 1000,
  autoReconnect: true,
  useWSS: false,
  networkSocketOptions: {
    timeout: 10000,
    keepAlive: true,
    keepAliveDelay: 10000
  }
};

// ================== Основные функции ==================

/**
 * Получение токена GigaChat
 */
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

/**
 * Классификация поста по темам
 */
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

/**
 * Поиск Telegram-каналов по теме
 */
export async function tgk_predl(tema) {
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const token = await getGigaChatToken();

    const prompt = `Ты — эксперт по поиску Telegram-каналов. Найди релевантные публичные каналы по теме: [${tema}]. 
    Формат ответа: Название (t.me/ссылка) - Описание`;

    const response = await axios.post(
      GIGACHAT_API_URL,
      {
        model: 'GigaChat-Pro',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500
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

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Ошибка поиска каналов:', error);
    return "Не удалось найти каналы по данной теме";
  }
}

/**
 * Сохранение поста и рассылка уведомлений
 */
async function savePost(postData, allThemes) {
  try {
    const postThemes = await classifyPost(postData.text, allThemes);
    console.log("Извлечённые темы:", postThemes);

    postData.tema = postThemes;
    const savedPost = await new PostModels.post_news(postData).save();


    const subscribedUsers = await UserTheme.find({
      themes: { $in: postThemes }
    });

    for (const user of subscribedUsers) {
      try {
        const userMatchedThemes = user.themes.filter(theme => 
          postThemes.includes(theme)
        );

        const themesText = formatThemesText(userMatchedThemes);
        
        await bot.sendMessage(
          user.telegramId,
          `📢 <b>Новый пост по теме: ${themesText}</b>\n` +
          `<b>Канал:</b> ${postData.channel}\n` +
          `<b>Текст:</b> ${postData.text.substring(0, 100)}...`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "🔗 Открыть пост", url: postData.ssilkaPost }
                ]
              ]
            }
          }
        );
      } catch (err) {
        console.error(`Ошибка отправки пользователю ${user.telegramId}:`, err.message);
      }
    }
  } catch (error) {
    console.error('⚠️ Ошибка сохранения:', error);
  }
}

// ================== Telegram Client ==================

/**
 * Создание и настройка клиента Telegram
 */
async function createClient() {
  const client = new TelegramClient(
    new StringSession(SAVED_SESSION),
    apiId,
    apiHash,
    clientConfig
  );

  // Обработчики событий подключения
  client.addEventHandler(update => {
    if (update.className === 'UpdateConnectionState') {
      switch (update.state) {
        case 0: // Disconnected
          console.warn('Соединение прервано');
          handleReconnection();
          break;
        case 1: // Connecting
          console.log('Подключаемся...');
          break;
        case 2: // Connected
          console.log('Успешное подключение');
          reconnectAttempts = 0;
          break;
      }
    }
  });

  return client;
}

/**
 * Обработка переподключения
 */
async function handleReconnection() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('Достигнуто максимальное количество попыток переподключения');
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);

  console.log(`Попытка переподключения #${reconnectAttempts} через ${delay}ms`);
  
  await new Promise(resolve => setTimeout(resolve, delay));
  
  try {
    if (clientInstance) {
      await clientInstance.disconnect();
    }
    await startMonitoring();
  } catch (err) {
    console.error('Ошибка при переподключении:', err);
    handleReconnection();
  }
}

/**
 * Инициализация мониторинга каналов
 */
export async function startMonitoring() {
  try {
    if (isMonitoring) return;

    clientInstance = await createClient();
    
    if (!clientInstance.connected) {
      console.log('Устанавливаем новое соединение...');
      await clientInstance.connect();
    }

    const channelsInfo = await initChannels();
    setupMessageHandler(channelsInfo);
    startHealthChecks();

    isMonitoring = true;
    console.log('👂 Мониторинг каналов активен');
    
  } catch (err) {
    console.error('Ошибка запуска мониторинга:', err);
    handleReconnection();
  }
}

/**
 * Инициализация каналов
 */
async function initChannels() {
  const channelsInfo = {};
  
  for (const username of CHANNELS_TO_MONITOR) {
    try {
      const channel = await clientInstance.getEntity(username);
      channelsInfo[channel.id.toString()] = {
        id: channel.id,
        title: channel.title,
        username
      };
      console.log(`🔎 Канал добавлен: ${channel.title}`);
    } catch (error) {
      console.error(`⚠️ Ошибка загрузки канала ${username}:`, error);
    }
  }
  
  return channelsInfo;
}

/**
 * Настройка обработчика сообщений
 */
function setupMessageHandler(channelsInfo) {
  clientInstance.addEventHandler(async (event) => {
    try {
      if (!['UpdateNewChannelMessage', 'UpdateNewMessage'].includes(event.className)) return;

      const msg = event.message;
      if (!msg.message) return;

      const sourceId = msg.peerId.className === 'PeerChannel' 
        ? msg.peerId.channelId.toString() 
        : null;

      if (!sourceId || !channelsInfo[sourceId]) return;

      const channel = channelsInfo[sourceId];
      console.log(`📩 Новый пост из ${channel.title}`);

      const allThemes = await UserTheme.distinct('themes');
      
      await savePost({
        text: msg.message,
        channel: channel.title,
        channelUsername: channel.username,
        channelId: channel.id,
        ssilkaPost: `https://t.me/${channel.username}/${msg.id}`,
        tema: []
      }, allThemes);
    } catch (error) {
      console.error('⚠️ Ошибка обработки сообщения:', error);
    }
  });
}

/**
 * Проверка здоровья соединения
 */
function startHealthChecks() {
  // Ping каждые 5 минут
  setInterval(async () => {
    try {
      if (clientInstance?.connected) {
        await clientInstance.invoke(new Api.Ping({ pingId: BigInt(Date.now()) }));
      }
    } catch (err) {
      console.error('Ping failed:', err);
      handleReconnection();
    }
  }, 300000);
}

// ================== Вспомогательные функции ==================

function formatThemesText(themes) {
  if (themes.length === 1) return themes[0];
  const last = themes.pop();
  return `${themes.join(', ')} и ${last}`;
}

/**
 * Инициализация пользователя
 */
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

// ================== Обработка завершения ==================

process.on('SIGINT', async () => {
  console.log('Завершение работы...');
  try {
    if (clientInstance) {
      await clientInstance.disconnect();
    }
    process.exit(0);
  } catch (err) {
    console.error('Ошибка при завершении:', err);
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});


export async function scrapeTgstat(query) {
  try {
    // 1. Имитируем браузерный запрос
    const response = await axios.get(`https://tgstat.ru/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9'
      }
    });

    // 2. Парсим HTML
    const dom = new JSDOM(response.data);
    const document = dom.window.document;
    
    // 3. Извлекаем данные
    const results = [];
    const items = document.querySelectorAll('.channel-list-item');
    
    items.forEach(item => {
      const title = item.querySelector('.title')?.textContent.trim();
      const url = item.querySelector('a[href^="/channel/"]')?.href;
      const subscribers = item.querySelector('.subscribers')?.textContent.trim();
      const description = item.querySelector('.description')?.textContent.trim();
      
      if (title && url) {
        results.push({
          title,
          url: `https://t.me/${url.split('/')[2]}`,
          subscribers,
          description
        });
      }
    });

    return results.slice(0, 20); // Первые 20 результатов
  } catch (error) {
    console.error('Ошибка скрейпинга:', error);
    return [];
  }
}
