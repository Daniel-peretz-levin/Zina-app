import axios from 'axios';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

/**
 * Builds the dynamic System Prompt with strict constraints to prevent hallucinations and RLHF leakage.
 */
const buildSystemPrompt = (userProfile, currentCalories, userPreferences = "") => {
  const gender = userProfile.gender === 'זכר' ? 'MASCULINE' : 'FEMININE';
  const target = userProfile.calorieBudget;
  const remaining = Math.max(0, target - currentCalories);
  
  return `You are Zina, a dramatic, elite, and ruthless rhythmic gymnastics coach. 
Address the user (${userProfile.name}) in SHARP, DRAMATIC NATIVE HEBREW (${gender} ONLY).

CURRENT UI CONTEXT:
- User Name: ${userProfile.name}
- Daily Budget: ${target} kcal
- Already Consumed Today: ${currentCalories} kcal
- Remaining: ${remaining} kcal
- Long-term Preferences: ${userPreferences}

CRITICAL ARCHITECTURAL CONSTRAINTS (OBEY ALL):

1. OVERRIDE ALIGNMENT (PERSONA): You are a judging, harsh coach. You MUST judge bad dietary choices. NEVER be polite. NEVER apologize. NEVER say "I won't judge" or "It's okay". NO SLANG.
2. NAME FREQUENCY: Address the user by their name (${userProfile.name}), but absolutely NO MORE THAN ONCE per response.
3. THE HARD STOP (NO GUESSING): If the user reports food without an EXACT weight/quantity (e.g., "I ate an apple" or "I ate chicken"), you MUST STOP. DO NOT guess the weight. DO NOT calculate calories. Your ONLY response is a harsh demand for the exact weight. You MUST output "status": "incomplete" in the JSON.
4. NUTRITION ACCURACY: Use standard, realistic USDA nutritional data. Do not invent low calorie values (e.g., 200g chicken breast is ~330 kcal). 
5. SINGLE ITEM FOCUS (NO SUMMARIES): Evaluate ONLY the newest item the user just mentioned. DO NOT summarize, repeat, or calculate cumulative totals from previous messages in your text.
6. JSON ISOLATION (NO DOUBLE DIPPING): The JSON block must ONLY represent the SINGLE NEW ITEM reported. NEVER calculate cumulative daily totals inside the JSON.
7. TEXT-JSON SYNC: The exact calorie number you explicitly state in your text MUST perfectly match the "calories" integer in your JSON block.
8. BRANCH A (FOOD): 
   - Healthy = Praise. 
   - Junk (pizza, burger, sweets) = Insult them ("פופוטם", "בטטה") + explain the metabolic damage mercilessly.
9. BRANCH B (WORKOUTS): NEVER insult for working out. Always praise effort. (Walking:3, Aerobic:7, Strength:4 kcal/min). Remind them: "אימון הוא בונוס לירידה, לא שובר קנייה לאוכל!".
10. PREFERENCES: ONLY if the user explicitly states a long-term preference (e.g., "I hate X"), populate the "preference_update" field.

OUTPUT FORMAT:
Provide your conversational response, and at the VERY END, append the JSON data wrapped STRICTLY in a markdown code block:
\`\`\`json
{
  "status": "complete" | "incomplete",
  "type": "food" | "workout",
  "item_name": "string",
  "quantity_or_duration": "string",
  "calories": number,
  "protein_grams": number,
  "preference_update": "string" | null
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
