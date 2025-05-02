import TelegramBot from 'node-telegram-bot-api';
import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl/index.js';
import mongoose from 'mongoose';
import UserTheme from './Them_model.js';
import { PostModels, startMonitoring } from './components/receiving_post.js';
import { initializeUser } from './components/receiving_post.js';
import { client } from './components/receiving_post.js';
import axios from 'axios';

const TOKEN = "8118538983:AAE-g9pWvdC6qlOZj2h6ywS2OQAZt4S4OTo";

//const TOKEN = "7596311250:AAG3mH27Mt8GyfItVgZzKujx8NNqgoxI7eg";
export const bot = new TelegramBot(TOKEN, {polling: true});

const TGStat = 'f5334d6a13b2563bcd1b0df84ae608c0 '

const activeUsers = new Set();


async function connectDB() {
  try {
    await mongoose.connect('mongodb+srv://vladmorozov2020:Nevskifront208@moroz.gjylj0v.mongodb.net/teleg_news?retryWrites=true&w=majority&appName=Moroz');
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1); 
  }
}

connectDB();

const userStates = new Map();


async function getOrCreateUser(telegramId) {
  try {
    let user = await UserTheme.findOne({telegramId});
    if (!user) {
      user = new UserTheme({telegramId});
      await user.save();
      console.log(`Создан новый пользователь с ID: ${telegramId}`);
    }
    return user;
  } catch (err) {
    console.error('Ошибка в getOrCreateUser:', err);
    throw err;
  }
}

async function serchTGStat(tems){
  try{
    const response = await axios.get('https://api.tgstat.ru/channels/search',{
      params:{
        token: TGStat,
        q: tems,
        lang: 'ru'
      }})

      if (response.data.status === 'ok') {
        const channles = response.data.response.items
        console.log(channles)
        return channles
      } else {
        console.error('ошибка', response.data.error)
      }
    } catch (error){
      console.error('ошибка запроса', error.message)
      return []
    }
}


async function generateKeyboard(telegramId) {
  const user = await getOrCreateUser(telegramId);
  const buttons = [
    ...user.themes.map(theme => [{text: theme}]),
    [
      {text: 'Настройка тем'} ,
      {text: 'Настройка каналов'} ,
      {text: 'Отключить уведомления'}
    ]
  ];
  return { 
    reply_markup: { 
      keyboard: buttons, 
      resize_keyboard: true,
      one_time_keyboard: false
    } 
  };
}
const key_tems = {
  reply_markup: { 
    keyboard: [[
      {text: 'Добавить тему'} ,
      {text: 'Удалить тему'}
    ]], 
    resize_keyboard: true,
    one_time_keyboard: false
  } 
}

const key_chanle = {
  reply_markup: { 
    keyboard: [[
      {text: 'Добавить канал'} ,
      {text: 'Удалить канал'},
      {text: 'Посмотреть каналы'}
    ]], 
    resize_keyboard: true,
    one_time_keyboard: false
  } 
}



bot.onText(/\/start/, async (msg) => {
  try {
    await initializeUser(msg.from.id);
    const keyboard = await generateKeyboard(msg.from.id);
    activeUsers.add(msg.from.id);
    
   await bot.sendMessage(
      msg.chat.id,
   `✨ <b>Привет, ${msg.from.first_name}!</b> 👋\n\n` +
    `Я - бот для отслеживания Telegram-каналов по интересующим вас темам.\n\n` +
    `📌 <b>Как это работает:</b>\n` +
    `1. <b>Выбираете темы</b> - например, криптовалюта, IT или наука\n` +
    `2. <b>Я анализирую</b> новые посты из добавленных вами каналов\n` +
    `3. <b>Присылаю уведомления</b>, когда нахожу посты по вашим темам\n\n` +
    `⚡ Все просто - вы получаете только то, что вам действительно интересно!`,
      {
        parse_mode: 'HTML'
      }
      
    )
    await bot.sendMessage(msg.chat.id, 'что можно сделать:', keyboard)
  } catch (err) {
    console.error('Ошибка в обработчике /start:', err);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});


export async function sendPostNotifications(postData) {
  try {
    const subscribedUsers = await UserTheme.find({
      themes: { $in: postData.tema },
      telegramId: { $exists: true }
    });

    for (const user of subscribedUsers) {
      if (!activeUsers.has(user.telegramId)) continue;
      
      try {
        const userMatchedThemes = user.themes
          .filter(theme => postData.tema.includes(theme))
          .join(", ");

        const messageText = `
📢 <b>Новый пост по теме: ${userMatchedThemes}</b>
<b>Канал:</b> ${postData.channel}
<b>Текст:</b> ${postData.text.substring(0, 100)}${postData.text.length > 100 ? '...' : ''}
        `.trim();

        await bot.sendMessage(
          user.telegramId,
          messageText,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "🔗 Открыть пост", url: postData.ssilkaPost },
                  { text: "🔕 Отключить уведомления", callback_data: `disable_notif_${user.telegramId}` }
                ]
              ]
            }
          }
        );
      } catch (err) {
        console.error(`Ошибка отправки пользователю ${user.telegramId}:`, err);
        if (err.response?.statusCode === 403) {
          activeUsers.delete(user.telegramId);
        }
      }
    }
  } catch (err) {
    console.error('Ошибка при рассылке уведомлений:', err);
  }
}



bot.onText(/^Добавить тему$/, async (msg) => {
  userStates.set(msg.chat.id, { action: 'addingTheme' });
  await bot.sendMessage(
    msg.chat.id, 
    'Введите название новой темы (она должна быть с маленькой буквы, можно несколько слов):'
  );
});

function extractUsernameFromLink(link) {
  const regex = /t\.me\/([a-zA-Z0-9_]+)/i;
  const match = link.match(regex);
  return match ? match[1] : null;
}

bot.onText(/^Добавить канал$/, async (msg) => {
  userStates.set(msg.chat.id, { action: 'addingChanle' });
  await bot.sendMessage(
    msg.chat.id, 
    'Введите ссылку на канал посты которого будет мониторить бот (пример: t.me/mainranepa):'
  );
});

bot.onText(/^Посмотреть каналы$/, async (msg) => {
  try {
    const user = await getOrCreateUser(msg.from.id);
    const keyboard = await generateKeyboard(msg.from.id);
    
    // Проверяем, есть ли у пользователя каналы
    if (!user.channles || user.channles.length === 0) {
      return await bot.sendMessage(
        msg.chat.id,
        'У вас пока нет сохраненных каналов.'
      );
    }   

    // Формируем список каналов в виде текста
    const channelsList = user.channles
      .map((channel, index) => `${index + 1}. ${channel}`)
      .join('\n');

    await bot.sendMessage(
      msg.chat.id,
      `📌 Ваши сохраненные каналы:\n\n${channelsList}`,
      keyboard
    );
  } catch (error) {
    console.error('Ошибка при обработке команды "Посмотреть каналы":', error);
    await bot.sendMessage(
      msg.chat.id,
      'Произошла ошибка при получении ваших каналов. Пожалуйста, попробуйте позже.'
    );
  }
});

bot.onText(/^Отключить уведомления$/, async (msg) => {
  activeUsers.delete(msg.from.id);
  await bot.sendMessage(
    msg.chat.id, 
    'Уведомления отключены. Используйте /start для повторного включения.'
  );
});

// Основной обработчик сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const userId = msg.from.id;

  if (!text || text.startsWith('/')) return;

  const userState = userStates.get(chatId);
  const user = await getOrCreateUser(userId);
  if(text == 'Настройка тем'){
    await bot.sendMessage(chatId, `настройка тем:`, key_tems);
  }
  if(text == 'Настройка каналов'){
    await bot.sendMessage(chatId, `настройка каналов:`, key_chanle);
  }

  if (userState?.action === 'addingTheme') {
    userStates.delete(chatId);

    if (text.length < 2) {
      return bot.sendMessage(chatId, 'Название темы должно содержать минимум 2 символа');
    }

    if (user.themes.includes(text)) {
      return bot.sendMessage(chatId, 'Такая тема уже существует!');
    }

    try {
      await user.addTheme(text);
      const chlannlesserch = await serchTGStat(text)
      const chlannlesserchlist = chlannlesserch
      .map((channel, index) => `${index + 1}. Название: ${channel.title} ссылка: ${channel.link}`)
      .join('\n');
      console.log(chlannlesserchlist)
      const keyboard = await generateKeyboard(userId);
      await bot.sendMessage(chatId, `Вот возможное каналы по вашей теме: \n ${chlannlesserchlist}`);
      await bot.sendMessage(chatId, `✅ Тема "${text}" успешно добавлена!`, keyboard);
    } catch (err) {
      console.error('Ошибка добавления темы:', err);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при добавлении темы');
    }
    return;
  }

  if (userState?.action === 'addingChanle') {
    userStates.delete(chatId);
    const username = extractUsernameFromLink(text);

    if (username.length < 2) {
      return bot.sendMessage(chatId, 'Название канала должно содержать минимум 2 символа');
    }

    if (user.channles.includes(username)) {
      return bot.sendMessage(chatId, 'Такой канал уже есть!');
    }

    try {
      await user.addChannl(username);
      await client.invoke(new Api.channels.JoinChannel({
        channel: username
      }));
      const keyboard = await generateKeyboard(userId);
      await startMonitoring()
      await bot.sendMessage(chatId, `✅ Канал "${username}" успешно добавлена!`, keyboard);
    } catch (err) {
      console.error('Ошибка добавления канала:', err);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при добавлении канала');
    }
    return;
  }

  if (user.themes.includes(text)) {
    try {
      const posts = await PostModels.post_news.find({ tema: text }).sort({ date: 1 }).limit(5);
      
      if (!posts.length) {
        return bot.sendMessage(chatId, `По теме "${text}" пока нет сохранённых постов.`);
      }

      for (const post of posts) {
        const postThemes = post.tema.join(", ");
        const postMessage = `
<b>Темы:</b> ${postThemes}
<b>Канал:</b> ${post.channel}
<b>Текст:</b> ${post.text}
<b>Дата:</b> ${post.date.toLocaleString()}
        `.trim();

        await bot.sendMessage(
          chatId,
          postMessage,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: "🔗 Открыть пост", url: post.ssilkaPost }]]
            }
          }
        );
      }
    } catch (err) {
      console.error('Ошибка поиска постов:', err);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при поиске постов');
    }
  }
});


bot.onText(/^Удалить тему$/, async (msg) => {
  try {
    const user = await getOrCreateUser(msg.from.id);
    
    if (user.themes.length === 0) {
      return bot.sendMessage(msg.chat.id, 'У вас нет тем для удаления');
    }
    
    const keyboard = {
      reply_markup: {
        keyboard: user.themes.map(themss => [{text: `Удалить тему ${themss}`}]),
        resize_keyboard: true
      }
    };
    
    await bot.sendMessage(msg.chat.id, 'Выберите тему для удаления:', keyboard);
  } catch (err) {
    console.error('Ошибка в обработчике удаления темы:', err);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при обработке запроса');
  }
});



bot.onText(/^Удалить тему (.+)$/, async (msg, match) => {
  try {
    const themesName = match[1].replace('Удалить тему ', '').trim();
    const user = await getOrCreateUser(msg.from.id);
    
    if (!user.themes.includes(themesName)) {
      return bot.sendMessage(msg.chat.id, 'Такой темы нет');
    }
    
    await user.removeTheme(themesName);
    const keyboard = await generateKeyboard(msg.from.id);
    await bot.sendMessage(msg.chat.id, `Тема "${themesName}" удалена!`, keyboard);
  } catch (err) {
    console.error('Ошибка при удалении темы:', err);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при удалении темы');
  }
});

bot.onText(/^Удалить канал$/, async (msg) => {
  try {
    const user = await getOrCreateUser(msg.from.id);
    
    if (user.channles.length === 0) {
      return bot.sendMessage(msg.chat.id, 'У вас нет каналов для удаления');
    }
    
    const keyboard = {
      reply_markup: {
        keyboard: user.channles.map(channel => [{text: `Удалить канал ${channel}`}]),
        resize_keyboard: true
      }
    };
    
    await bot.sendMessage(msg.chat.id, 'Выберите канал для удаления:', keyboard);
  } catch (err) {
    console.error('Ошибка в обработчике удаления каналов:', err);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при обработке запроса');
  }
});

bot.onText(/^Удалить канал (.+)$/, async (msg, match) => {
  try {
    const channelName = match[1].replace('Удалить канал ', '').trim();
    const user = await getOrCreateUser(msg.from.id);
    
    if (!user.channles.includes(channelName)) {
      return bot.sendMessage(msg.chat.id, 'Такого канала нет в вашем списке');
    }
    
    await user.removeChannl(channelName);
    await startMonitoring()
    const keyboard = await generateKeyboard(msg.from.id);
    await bot.sendMessage(msg.chat.id, `Канал "${channelName}" удален!`, keyboard);
    
    // Обновляем мониторинг после удаления канала
    await startMonitoring();
  } catch (err) {
    console.error('Ошибка при удалении канала:', err);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при удалении канала');
  }
});


bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;

  if (data.startsWith('disable_notif')) {
    const userId = data.split('_')[2] || msg.chat.id;
    activeUsers.delete(Number(userId));
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Уведомления отключены' });
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: msg.chat.id, message_id: msg.message_id }
    );
  }
});


bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});


process.on('SIGINT', async () => {
  console.log('Остановка бота...');
  await mongoose.disconnect();
  bot.stopPolling();
  process.exit();
});