import TelegramBot from 'node-telegram-bot-api'
import mongoose from "mongoose"
import { PostModels } from './components/receiving_post.js'
import { main } from './components/receiving_post.js';
const TOKEN = "7082809857:AAEFs5F0q9mDFl20ki2RTbP_97EXkM-xaS8"

const bot = new TelegramBot(TOKEN, {polling: true});

mongoose.connect('mongodb+srv://vladmorozov2020:Nevskifront208@moroz.gjylj0v.mongodb.net/telegram?retryWrites=true&w=majority&appName=Moroz')
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB error:', err));

await main();

const themesKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: 'Павел Клепинин' }, { text: 'IT' }],
      [{ text: '«я-ИТ-ы»' }, { text: 'Mirera' }, { text: 'Roblox в связке с вуз и образование'}, {text: 'другое'}]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  }
};

bot.onText("/start", (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Выберите тему:', themesKeyboard);
});


bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;


  if (text.startsWith('/')) return;

  try {
    let posts = [];
    
    if (text === 'Павел Клепинин') {
      posts = await PostModels.klepinin.find().sort({ date: -1 }).limit(5);
    } else if (text === 'IT') {
      posts = await PostModels.it_cifrovizaciya.find().sort({ date: -1 }).limit(5);
    } else if (text === '«я-ИТ-ы»') {
      posts = await PostModels.ya_it_i.find().sort({ date: -1 }).limit(5);
    } else if (text === 'Mirera') {
      posts = await PostModels.mirera.find().sort({ date: -1 }).limit(5);
    } else if (text === 'Roblox в связке с вуз и образование') {
      posts = await PostModels.roblox.find().sort({ date: -1 }).limit(5);
    } else if (text === 'другое') {
      posts = await PostModels.other.find().sort({ date: -1 }).limit(5);
    }else {
      return;
    }

    if (posts.length === 0) {
      await bot.sendMessage(chatId, `Пока нет сохранённых постов по теме "${text}".`);
      return;
    }

    for (const post of posts) {
      await bot.sendMessage(
        chatId,
        `<b>Канал:</b> ${post.channel}\n` +
        `<b>Текст:</b> ${post.text}\n` +
        `<b>Дата:</b> ${post.date.toLocaleString()}`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔗 Открыть пост", url: post.ssilkaPost }]
            ]
          }
        }
      )
    }
  } catch (err) {
    console.error('Ошибка:', err)
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.')
  }
})