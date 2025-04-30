import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import UserTheme from './Them_model.js';
import { PostModels } from './components/receiving_post.js';
import { initializeUser } from './components/receiving_post.js';
import { tgk_predl }  from './components/receiving_post.js';

const TOKEN = "8118538983:AAE-g9pWvdC6qlOZj2h6ywS2OQAZt4S4OTo";

//const TOKEN = "7596311250:AAG3mH27Mt8GyfItVgZzKujx8NNqgoxI7eg";
export const bot = new TelegramBot(TOKEN, {polling: true});

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


async function generateKeyboard(telegramId) {
  const user = await getOrCreateUser(telegramId);
  const buttons = [
    ...user.themes.map(theme => [{text: theme}]),
    [
      {text: 'Добавить тему'}, 
      {text: 'Удалить тему'}, 
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



bot.onText(/\/start/, async (msg) => {
  try {
    await initializeUser(msg.from.id);
    const keyboard = await generateKeyboard(msg.from.id);
    activeUsers.add(msg.from.id);
    
    const welcomeMessage = `
Каналы, посты которых принимает бот:
1. ВШГУ Президентской академии
2. Технологическое лидерство России
3. Канал Алексея Комиссарова
4. Личность в системах управления
5. Институт ЭМИТ РАНХиГС
6. РАНХиГС. Новости
    `.trim();
    
    await bot.sendMessage(msg.chat.id, welcomeMessage);
    await bot.sendMessage(msg.chat.id, 'Выберите тему:', keyboard);
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
      let predl = tgk_predl(text)
      const keyboard = await generateKeyboard(userId);
      await bot.sendMessage(chatId, `${predl}`);
      await bot.sendMessage(chatId, `✅ Тема "${text}" успешно добавлена!`, keyboard);
    } catch (err) {
      console.error('Ошибка добавления темы:', err);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при добавлении темы');
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
        keyboard: user.themes.map(theme => [{text: `Удалить ${theme}`}]),
        resize_keyboard: true
      }
    };
    
    await bot.sendMessage(msg.chat.id, 'Выберите тему для удаления:', keyboard);
  } catch (err) {
    console.error('Ошибка в обработчике удаления тем:', err);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при обработке запроса');
  }
});

bot.onText(/^Удалить (.+)$/, async (msg, match) => {
  try {
    const themeName = match[1];
    const user = await getOrCreateUser(msg.from.id);
    
    if (!user.themes.includes(themeName)) {
      return bot.sendMessage(msg.chat.id, 'Такой темы нет');
    }
    
    await user.removeTheme(themeName);
    const keyboard = await generateKeyboard(msg.from.id);
    await bot.sendMessage(msg.chat.id, `Тема "${themeName}" удалена!`, keyboard);
  } catch (err) {
    console.error('Ошибка при удалении темы:', err);
    await bot.sendMessage(msg.chat.id, 'Произошла ошибка при удалении темы');
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