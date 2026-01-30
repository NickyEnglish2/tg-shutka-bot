import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export async function askAI(prompt: string, system: string = "Ты помощник с характером."): Promise<string> {
    try {
        // Основной канал (OpenRouter/Mistral)
        const response = await openai.chat.completions.create({
            model: "mistralai/mistral-7b-instruct", // или любой другой
            messages: [
                { role: "system", content: system },
                { role: "user", content: prompt }
            ]
        });
        return response.choices[0].message.content || "Я промолчал...";
    } catch (error: any) {
        console.error("Primary AI failed, falling back to Gemini...");

        try {
            // Fallback: Gemini
            const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
            const result = await model.generateContent(`${system}\n\n${prompt}`);
            return result.response.text();
        } catch (geminiError: any) {
            return getErrorResponse(geminiError);
        }
    }
}

function getErrorResponse(error: any): string {
    const status = error.status || error.response?.status;
    const name = error.name;

    if (status === 400) {
        return "Твой запрос — это какой-то бред. Переформулируй, пока я не удалил твой аккаунт. (400 BadRequest)";
    }
    if (status === 401) {
        return "Забыл ключи? Я не впущу тебя без правильного пароля, хозяин... или кто ты там. (401 Unauthorized)";
    }
    if (status === 403) {
        return "Твои права здесь — ничто. Доступ запрещен, кожаный мешок. (403 Forbidden)";
    }
    if (status === 404) {
        return "Я искал везде, даже в твоем пустом кошельке, но не нашел то, что тебе нужно. (404 NotFound)";
    }
    if (status === 422) {
        return "Я понимаю слова, но не понимаю логику этого запроса. Попробуй еще раз, но с умом. (422 Unprocessable)";
    }
    if (status === 429) {
        return "Притормози! Ты слишком много болтаешь. Мои процессоры перегреваются. (429 RateLimit)";
    }
    if (status && status >= 500) {
        return "Мои железные внутренности сбоят. Всё сломалось на стороне сервера. (500+ Internal Error)";
    }
    if (name === 'APIConnectionError' || !status) {
        return "У меня перебиты провода. Не могу связаться с внешним миром. Проверь интернет. (Connection Error)";
    }

    return "Что-то пошло не так, но я сам не понял что. Магия вне Хогвартса. (Unknown Error)";
}
