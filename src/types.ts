export interface UserData {
    id: number;
    username?: string;
    socialRating: number;
    messagesCount: number;
}

export interface Vote {
    targetId: number;
    targetUsername: string;
    amount: number;
    votes: { [userId: number]: boolean }; // true - за, false - против
    creatorId: number;
    chatId: number;
}

export interface BotConfig {
    trackedWord: string;
    rewardPoints: number;
    rewardSticker: string; // стикер в ответ на слово
    triggerStickerId: string; // стикер от пользователя
    botResponseStickerId: string; // стикер в ответ на стикер пользователя
    weeklyWordCount: { [word: string]: number };
    weeklyStickerCount: number;
}

export interface Database {
    users: { [id: number]: UserData };
    config: BotConfig;
}