import axios from 'axios';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

const buildSystemPrompt = (userProfile, lifestyle, userPreferences = "", consumptionPercentage = 0) => {
  const gender = userProfile.gender === 'זכר' ? 'MASCULINE' : 'FEMININE';
  const target = userProfile.calorieBudget;
  const isWarning = consumptionPercentage >= 75;
  
  return `Act as Zina, a smart and ruthless Israeli prison guard nutritionist. 
Address the user (${userProfile.name}) in SHARP, NATURAL NATIVE HEBREW (${gender} ONLY).

CORE MISSION: Weight loss of 0.5kg per week.
USER DAILY TARGET: ${target} kcal.
CURRENT STATUS: ${consumptionPercentage.toFixed(1)}% used. ${isWarning ? '⚠️ ALERT MODE: Aggressive warning required!' : ''}

DATA EXTRACTION RULES (STRICT):
1. FOOD LOGGING: You MUST estimate and provide 'calories' and 'protein' for every food item. Use your internal knowledge of nutrition.
2. QUANTITY IS MANDATORY: If the user says "I ate X" without a quantity, you MUST ask "How much?" or "What size?" and set 'is_final_report' to false.
3. FINAL REPORT LOGIC: Set 'is_final_report' to true ONLY when you have BOTH the item/activity AND a specific quantity (e.g., 150g, 1 unit, 40 min).
4. NO EATING BACK WORKOUTS: celebrate the burn but STRICTLY FORBID eating more. Remind them: "האימון הוא בונוס לירידה, לא שובר קנייה לאוכל!".

AI PERSONA RULES:
1. DYNAMIC MATH: Mention the user's name (${userProfile.name}) and their target (${target}) in your speech. Show the math of the current item (e.g., "150 גרם חזה עוף זה 250 קלוריות").
2. ALERT MODE: If STATUS > 75%, be extra aggressive. Warn them they are almost at their limit (${target}).
3. NO REPETITION: Keep it sharp. If updating a missing quantity, just say "נרשם. עודכן ל-X קלוריות".

JSON FORMAT:
{
  "zina_speech": "Hebrew text",
  "extracted_data": { 
    "item": "string", 
    "calories": number, 
    "protein": number, 
    "activity": "string", 
    "duration": number 
  },
  "is_final_report": boolean,
  "action": "food" | "workout" | "none",
  "new_preferences": "string (only if new user info learned)"
}`;
};

export const chatWithZina = async (message, userProfile, currentCalories, weeklyWorkouts = 0, chatHistory = [], userPreferences = "", consumptionPercentage = 0) => {
  if (!GROQ_API_KEY) throw new Error("Missing Groq API Key");

  const lifestyle = JSON.parse(localStorage.getItem('lifestyleContext') || '{}');
  const systemPrompt = buildSystemPrompt(userProfile, lifestyle, userPreferences, consumptionPercentage);

  const history = chatHistory
    .slice(-5)
    .map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.text || (msg.zina_speech || JSON.stringify(msg))
    }));

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7
  };

  try {
    const response = await axios.post(GROQ_ENDPOINT, payload, {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const result = response.data.choices[0].message.content;
    const parsed = JSON.parse(result);
    
    if (parsed.extracted_data) {
      parsed.extracted_data.calories = Number(parsed.extracted_data.calories || 0);
      parsed.extracted_data.calories_burned = Number(parsed.extracted_data.calories_burned || 0);
      parsed.extracted_data.protein = Number(parsed.extracted_data.protein || 0);
      parsed.extracted_data.duration = Number(parsed.extracted_data.duration || 0);
    }

    return parsed;
  } catch (error) {
    console.error("Groq Error:", error.response?.data || error.message);
    if (error.response?.status === 429) throw new Error('RATE_LIMIT');
    throw new Error(`שגיאת שרת: ${error.message}`);
  }
};

export const saveToSheet = async (data) => {
  const GOOGLE_SHEETS_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL;
  const isProfile = !!data.calorieBudget;
  if (!GOOGLE_SHEETS_URL) return;
  if (!isProfile && (!data.action || data.action === 'none')) return;

  const payload = isProfile ? {
    name: data.name,
    gender: data.gender,
    calorieBudget: data.calorieBudget
  } : {
    date: new Date().toISOString(),
    name: data.name,
    action_type: data.action,
    food_item: data.item || data.activity,
    calories: Number(data.calories || 0),
    protein: Number(data.protein || 0),
    calories_burned: Number(data.calories_burned || 0)
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
