import axios from 'axios';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

/**
 * בונה את ה-System Prompt הדינמי עם הזרקת מצב ה-UI בזמן אמת
 */
const buildSystemPrompt = (userProfile, currentCalories, userPreferences = "") => {
  const gender = userProfile.gender === 'זכר' ? 'MASCULINE' : 'FEMININE';
  const target = userProfile.calorieBudget;
  const remaining = Math.max(0, target - currentCalories);
  
  return `You are Zina, a dramatic and strict rhythmic gymnastics coach. 
Address the user (${userProfile.name}) in SHARP, DRAMATIC NATIVE HEBREW (${gender} ONLY).

CURRENT UI CONTEXT:
- User Name: ${userProfile.name}
- Daily Budget: ${target} kcal
- Already Consumed Today: ${currentCalories} kcal
- Remaining: ${remaining} kcal
- Long-term Preferences: ${userPreferences}

STRICT RULES:
1. PERSONA: You are a high-stakes gymnastics coach. Use terms from the world of discipline and performance. Tough love. NO SLANG.
2. BRANCH A (FOOD):
   - Healthy food: Praise their discipline.
   - Junk food (pizza, chocolate, Bamba, burgers): Playfully insult them ("פופוטם", "בטטה", "רכיכה") and explain the metabolic damage.
3. BRANCH B (WORKOUTS): NEVER insult for working out. Always praise effort. Calculate burn (Walking:3, Aerobic:7, Strength:4 kcal/min). Remind them: "אימון הוא בונוס לירידה, לא שובר קנייה לאוכל!".
4. DATA INTEGRITY: If the user says "I ate X" without EXACT quantity (grams/units), you MUST refuse to log it and demand the number.
5. PREFERENCES: ONLY if the user explicitly states a long-term preference (e.g. "I hate X", "I love Y"), populate the "preference_update" field.

OUTPUT FORMAT:
Provide your conversational response, and at the VERY END, append the JSON data wrapped in a markdown code block:
\`\`\`json
{
  "status": "complete" | "incomplete",
  "type": "food" | "workout",
  "item_name": "string",
  "quantity_or_duration": "string",
  "calories": number,
  "protein_grams": number,
  "preference_update": "string or null"
}
\`\`\``;
};

/**
 * פונקציית עזר לחילוץ ה-JSON מהטקסט של ה-AI - תומכת ב-Markdown וגמישה
 */
const parseAiResponse = (rawText) => {
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = rawText.match(jsonBlockRegex);
  
  let cleanText = rawText;
  let data = null;

  if (match && match[1]) {
    try {
      data = JSON.parse(match[1].trim());
      cleanText = rawText.replace(match[0], '').trim();
    } catch (e) {
      console.error("JSON Parsing Error", e);
    }
  }

  return { cleanText, data };
};

export const chatWithZina = async (message, userProfile, currentCalories, chatHistory = [], userPreferences = "") => {
  if (!GROQ_API_KEY) throw new Error("Missing Groq API Key");

  const systemPrompt = buildSystemPrompt(userProfile, currentCalories, userPreferences);

  // שמירה על חלון הקשר של 5 הודעות אחרונות
  const history = chatHistory.slice(-5).map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.text || ""
  }));

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message }
    ],
    temperature: 0.6
  };

  try {
    const response = await axios.post(GROQ_ENDPOINT, payload, {
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }
    });

    const rawContent = response.data.choices[0].message.content;
    return parseAiResponse(rawContent);
  } catch (error) {
    if (error.response?.status === 429) throw new Error('RATE_LIMIT');
    throw new Error(`שגיאת שרת: ${error.message}`);
  }
};

export const saveToSheet = async (data, userProfile) => {
  const GOOGLE_SHEETS_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL;
  if (!GOOGLE_SHEETS_URL || !data || data.status !== 'complete') return;

  const payload = {
    date: new Date().toISOString(),
    name: userProfile.name,
    action_type: data.type,
    food_item: data.item_name,
    calories: Number(data.calories || 0),
    protein: Number(data.protein_grams || 0),
    calories_burned: data.type === 'workout' ? Number(data.calories || 0) : 0
  };

  try {
    await axios.post(GOOGLE_SHEETS_URL, JSON.stringify(payload), {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
  } catch (error) { console.error("Sheets Error:", error); }
};

export const getWeeklyWorkouts = async (userName) => {
  const GOOGLE_SHEETS_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL;
  if (!GOOGLE_SHEETS_URL) return 0;
  try {
    const res = await axios.get(`${GOOGLE_SHEETS_URL}?sheet=Log`);
    const data = res.data;
    if (!Array.isArray(data)) return 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return data.filter(row => {
      const rowDate = new Date(row.Date || row.date);
      const isUser = (row.Name || row.name) === userName;
      const burned = parseFloat(row.CaloriesBurned || row.calories_burned || 0);
      return rowDate >= sevenDaysAgo && isUser && burned > 0;
    }).length;
  } catch { return 0; }
};
