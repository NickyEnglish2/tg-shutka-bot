import fs from 'fs';
import { debounce } from 'lodash';
import { Database } from './types';

const DB_PATH = './db.json';

const defaultDb: Database = {
    users: {},
    config: {
        trackedWord: 'пушистик',
        rewardPoints: 5,
        rewardSticker: 'CAACAgIAAxkBAAEL...',
        triggerStickerId: '',
        botResponseStickerId: '',
        weeklyWordCount: {},
        weeklyStickerCount: 0
    }
};

let db: Database = fs.existsSync(DB_PATH)
    ? JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
    : defaultDb;

const saveToDisk = debounce(() => {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}, 1000);

export const DB = {
    get: () => db,
    save: () => saveToDisk(),
    getUser: (id: number, username?: string) => {
        if (!db.users[id]) {
            db.users[id] = { id, username, socialRating: 100, messagesCount: 0 };
        }
        return db.users[id];
    }
};