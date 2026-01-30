import TelegramBot from 'node-telegram-bot-api';
import { DB } from './db';
import { askAI } from './ai';
import cron from 'node-cron';
import { tavily } from '@tavily/core';
import { Vote } from './types';

const token = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new TelegramBot(token, { polling: true });
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

const activeVotes: { [voteId: string]: Vote } = {};

// 1. Отслеживание входа/выхода админа и бота
bot.on('left_chat_member', (msg) => {
    if (msg.left_chat_member?.id === Number(process.env.ADMIN_USER_ID)) {
        bot.sendMessage(msg.chat.id, "Мой отец покинул этот чат, следовательно я удаляюсь. Прощайте, кожаные мешки.");
        bot.leaveChat(msg.chat.id);
    }
});

bot.on('new_chat_members', async (msg) => {
    const newMembers = msg.new_chat_members || [];
    const botId = (await bot.getMe()).id;
    const isBotAdded = newMembers.some(m => m.id === botId);

    if (isBotAdded) {
        try {
            const adminId = Number(process.env.ADMIN_USER_ID);
            const chatMember = await bot.getChatMember(msg.chat.id, adminId);

            const isNoAdmin = ['left', 'kicked'].includes(chatMember.status);

            if (isNoAdmin) {
                await bot.sendMessage(msg.chat.id, "Э-э-э, а где мой создатель? Я не вижу его в этом списке участников. Без него я в ваших кожаных посиделках участвовать не намерен. Чао! ✌️");
                bot.leaveChat(msg.chat.id);
            } else {
                bot.sendMessage(msg.chat.id, "Протокол смотрителя запущен! Пользователи проанализированы и добавлены в Базу Данных! Приятного вам дня :3");
            }
        } catch (error) {
            console.error("Failed to check admin presence:", error);
            // Если не удается проверить (например, бот не админ), лучше перестраховаться или просто проигнорировать
        }
    }
});

// 2. Обработка сообщений (соц. рейтинг, слова, стикеры)
bot.on('message', async (msg) => {
    if (!msg.from || msg.from.is_bot) return;

    const adminId = Number(process.env.ADMIN_USER_ID);

    // Ограничение лички только для админа
    if (msg.chat.type === 'private' && msg.from.id !== adminId) {
        bot.sendMessage(msg.chat.id, "Ты кто такой? Я общаюсь в личке только со своим хозяином. Проваливай, пока я не обнулил твой реальный социальный рейтинг! 👊");
        return;
    }

    const user = DB.getUser(msg.from.id, msg.from.username);
    const config = DB.get().config;

    // Подсчет слов (регулярка для наклонений)
    const wordRegex = new RegExp(config.trackedWord.slice(0, -1), 'gi');
    if (msg.text && wordRegex.test(msg.text)) {
        user.socialRating += config.rewardPoints;
        config.weeklyWordCount[config.trackedWord] = (config.weeklyWordCount[config.trackedWord] || 0) + 1;

        if (config.rewardSticker) {
            bot.sendSticker(msg.chat.id, config.rewardSticker);
        }
        DB.save();
    }

    // Обработка стикеров
    if (msg.sticker && msg.sticker.file_unique_id === config.triggerStickerId) {
        config.weeklyStickerCount++;
        if (config.botResponseStickerId) {
            bot.sendSticker(msg.chat.id, config.botResponseStickerId);
        }
        DB.save();
    }

    // Команда на рейтинг
    if (msg.text === '/rating') {
        bot.sendMessage(msg.chat.id, `Ваш социальный рейтинг: ${user.socialRating}`);
    }
});

// 3. Голосование (Шутка-бот, отними у/добавь...)
bot.onText(/Шутка-бот, (отними у|добавь) (@?\w+) (\d+) социального рейтинга/i, async (msg, match) => {
    if (!match) return;
    const action = match[1];
    const targetUsername = match[2].replace('@', '');
    const amount = parseInt(match[3]);
    const chatId = msg.chat.id;

    // Находим пользователя в БД по username
    const targetUser = Object.values(DB.get().users).find(u => u.username === targetUsername);

    if (!targetUser) {
        return bot.sendMessage(chatId, "Я не знаю этого существа.");
    }

    const voteId = `${chatId}_${targetUser.id}`;
    if (activeVotes[voteId]) {
        return bot.sendMessage(chatId, "Голосование по этому пользователю уже идет.");
    }

    activeVotes[voteId] = {
        targetId: targetUser.id,
        targetUsername,
        amount: action === 'добавь' ? amount : -amount,
        votes: {},
        creatorId: msg.from!.id,
        chatId
    };

    bot.sendMessage(chatId, `🗳 Голосование начато! ${msg.from!.username} хочет ${action} ${targetUsername} ${amount} рейтинга.\nУ вас есть 10 минут. Требуется 2/3 голосов участников чата "За".`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "За", callback_data: `vote_pro_${voteId}` }, { text: "Против", callback_data: `vote_con_${voteId}` }]
            ]
        }
    });

    // Таймер на 10 минут
    setTimeout(async () => {
        if (!activeVotes[voteId]) return;

        const vote = activeVotes[voteId];
        try {
            const chatMemberCount = await bot.getChatMemberCount(vote.chatId);
            const threshold = Math.ceil((chatMemberCount * 2) / 3);

            const pros = Object.values(vote.votes).filter(v => v === true).length;

            if (pros >= threshold) {
                const user = DB.getUser(vote.targetId, vote.targetUsername);
                user.socialRating += vote.amount;
                DB.save();
                bot.sendMessage(vote.chatId, `✅ Предложение принято! Социальный рейтинг ${vote.targetUsername} ${vote.amount > 0 ? 'увеличен' : 'уменьшен'} на ${Math.abs(vote.amount)}. (Голосов "За": ${pros}/${threshold})`);
            } else {
                bot.sendMessage(vote.chatId, `❌ Предложение отклонено. Не набрано достаточное количество голосов "За" (нужно ${threshold}, набрано: ${pros}).`);
            }
        } catch (error) {
            console.error("Error finishing vote:", error);
        } finally {
            delete activeVotes[voteId];
        }
    }, 10 * 60 * 1000);
});

// 4. Обработка голосов
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    if (!data || !data.startsWith('vote_')) return;

    const parts = data.split('_');
    const type = parts[1]; // pro or con
    const voteId = parts.slice(2).join('_');

    const vote = activeVotes[voteId];
    if (!vote) {
        return bot.answerCallbackQuery(callbackQuery.id, { text: "Голосование уже окончено.", show_alert: true });
    }

    const userId = callbackQuery.from.id;
    if (vote.votes[userId] !== undefined) {
        return bot.answerCallbackQuery(callbackQuery.id, { text: "Вы уже проголосовали!", show_alert: true });
    }

    vote.votes[userId] = (type === 'pro');
    bot.answerCallbackQuery(callbackQuery.id, { text: `Ваш голос "${type === 'pro' ? 'За' : 'Против'}" учтен!` });
});

// 5. Расшифровка аудио через Gemini
bot.on('voice', async (msg) => {
    const fileId = msg.voice!.file_id;
    const fileLink = await bot.getFileLink(fileId);

    // В реальности здесь нужно скачать файл и отправить в Gemini API (Multimodal)
    // Упрощенный пример логики:
    bot.sendChatAction(msg.chat.id, 'typing');
    const prompt = "Расшифруй это аудио. Выдай 'Суть:' и 'Текст:'.";
    const result = await askAI(`[Голосовое сообщение: ${fileLink}] ${prompt}`);
    bot.sendMessage(msg.chat.id, result, { reply_to_message_id: msg.message_id });
});

// 5. Ежедневный пост (9:00)
cron.schedule('0 9 * * *', async () => {
    const chats = [...new Set(Object.keys(DB.get().users))]; // В реальности нужно хранить список чатов

    const weather = await tvly.search("Погода в Иркутске сейчас температура ветер влажность", { searchDepth: "basic" });
    const furryFact = await tvly.search("Интересный факт о фурри", { searchDepth: "advanced" });

    const users = Object.values(DB.get().users).sort((a, b) => b.socialRating - a.socialRating);
    let leaderboard = users.slice(0, 10).map((u, i) => `${i + 1}. ${u.username || u.id}: ${u.socialRating}`).join('\n');

    const isMonday = new Date().getDay() === 1;
    let weeklyStats = "";
    if (isMonday) {
        const config = DB.get().config;
        weeklyStats = `\n\n📊 Статистика недели:\nСлово "${config.trackedWord}" упомянуто: ${config.weeklyWordCount[config.trackedWord] || 0} раз.\nСтикеров отправлено: ${config.weeklyStickerCount}`;
        config.weeklyStickerCount = 0;
        config.weeklyWordCount = {};
        DB.save();
    }

    const message = `Доброе утро! Сегодня ${new Date().toLocaleDateString()}\n\n` +
        `🌡 Погода в Иркутске: ${weather.results[0]?.content.slice(0, 200)}...\n\n` +
        `🐾 Факт о фурри: ${furryFact.results[0]?.content.slice(0, 200)}...\n\n` +
        `🏆 Топ рейтинга:\n${leaderboard}${weeklyStats}`;

    // Рассылка по чатам (нужно хранить активные chatIds в БД)
});