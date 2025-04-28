import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import UserTheme from './Them_model.js';
import { PostModels } from './components/receiving_post.js';
import { main } from './components/receiving_post.js';

const TOKEN = "8118538983:AAE-g9pWvdC6qlOZj2h6ywS2OQAZt4S4OTo";
const bot = new TelegramBot(TOKEN, {polling: true});


mongoose.connect('mongodb+srv://vladmorozov2020:Nevskifront208@moroz.gjylj0v.mongodb.net/teleg_news?retryWrites=true&w=majority&appName=Moroz')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));


const userStates = new Map();

async function getOrCreateUser(telegramId) {
  try {
    let user = await UserTheme.findOne({telegramId});
    if (!user) {
      user = new UserTheme({telegramId: telegramId});
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
    ...user.themes.map(theme => [{text: `тема: ${theme}`}]),
    [{text: 'Добавить тему'}, {text: 'Удалить тему'}]
  ];
  return { reply_markup: { keyboard: buttons, resize_keyboard: true } };
}

bot.onText(/\/start/, async (msg) => {
  await main(msg.from.id);
  const keyboard = await generateKeyboard(msg.from.id);
  await bot.sendMessage(msg.chat.id, 'Выберите тему:', keyboard);
});


bot.onText(/^Добавить тему$/, async (msg) => {
  userStates.set(msg.chat.id, { action: 'addingTheme' });
  await bot.sendMessage(msg.chat.id, 'Введите название новой темы (она должна быть с маленькой буквы, можно несколько слов):');
});


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
      const keyboard = await generateKeyboard(userId);
      await bot.sendMessage(chatId, `✅ Тема "${text}" успешно добавлена!`, keyboard);
    } catch (err) {
      console.error('Ошибка добавления темы:', err);
      await bot.sendMessage(chatId, '❌ Произошла ошибка при добавлении темы');
    }
    return;
  }


  if (user.themes.includes(text)) {
    try {
      const posts = await PostModels.post_news.find({tema: text}).sort({date: 1}).limit(5);
      
      if (!posts.length) {
        return bot.sendMessage(chatId, `По теме "${text}" пока нет сохранённых постов.`);
      }

      for (const post of posts) {
        await bot.sendMessage(
          chatId,
          `<b>Тема:</b> ${post.tema}\n` +
          `<b>Канал:</b> ${post.channel}\n` +
          `<b>Текст:</b> ${post.text}\n` +
          `<b>Дата:</b> ${post.date.toLocaleString()}`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{text: "🔗 Открыть пост", url: post.ssilkaPost}]]
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
});

bot.onText(/^Удалить (.+)$/, async (msg, match) => {
  const themeName = match[1];
  const user = await getOrCreateUser(msg.from.id);
  
  if (!user.themes.includes(themeName)) {
    return bot.sendMessage(msg.chat.id, 'Такой темы нет');
  }
  
  await user.removeTheme(themeName);
  const keyboard = await generateKeyboard(msg.from.id);
  await bot.sendMessage(msg.chat.id, `Тема "${themeName}" удалена!`, keyboard);
});