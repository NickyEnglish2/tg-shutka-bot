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
            const model = genAI.getGenerativeModel({ model: "gemini-3-flash" });
            const result = await model.generateContent(`${system}\n\n${prompt}`);
            return result.response.text();
        } catch (geminiError: any) {
            return getErrorResponse(geminiError);
        }
    }
}

function getErrorResponse(error: any): string {
    const messages = [
        "Мои мозги плавятся, попробуй позже.",
        "Вселенная API сказала 'нет'. Видимо, я слишком хорош для этого запроса.",
        "Либо у тебя закончились деньги, либо у меня — терпение. (Ошибка API)",
        "Этот запрос настолько грязный, что даже мои фильтры покраснели."
    ];
    return messages[Math.floor(Math.random() * messages.length)];
}