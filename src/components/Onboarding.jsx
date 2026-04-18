import { useState } from 'react';
import './Onboarding.css';

export default function Onboarding({ onSave }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    gender: 'נקבה',
    age: '',
    height: '',
    weight: '',
    activityLevel: '1.2',
    workoutSchedule: '',
    mealStructure: '',
    weakness: ''
  });
  const [calculatedBudget, setCalculatedBudget] = useState(0);

  const calculateBudget = () => {
    const { gender, age, height, weight, activityLevel } = formData;
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const a = parseInt(age);
    const factor = parseFloat(activityLevel);

    if (!w || !h || !a) return 0;

    let bmr = 0;
    if (gender === 'זכר') {
      bmr = 10 * w + 6.25 * h - 5 * a + 5;
    } else {
      bmr = 10 * w + 6.25 * h - 5 * a - 161;
    }

    return Math.round(bmr * factor);
  };

  const handleNext = (e) => {
    e.preventDefault();
    // Step 1 (details) → Step 2 (interview)
    setStep(2);
  };

  const handleInterviewNext = (e) => {
    e.preventDefault();
    // Step 2 (interview) → Step 3 (budget confirmation)
    const budget = calculateBudget();
    setCalculatedBudget(budget);
    setStep(3);
  };

  const handleSave = () => {
    onSave({
      ...formData,
      calorieBudget: calculatedBudget,
      lifestyleContext: {
        workoutSchedule: formData.workoutSchedule,
        mealStructure: formData.mealStructure,
        weakness: formData.weakness
      }
    });
  };

  if (step === 3) {
    return (
      <div className="onboarding">
        <div className="onboarding-card">
          <h1>התקציב שלך מוכן!</h1>
          <p>לפי הנתונים שהזנת, התקציב הקלורי היומי המומלץ עבורך הוא:</p>
          <h2 style={{ fontSize: '3rem', color: 'var(--accent)', margin: '20px 0' }}>{calculatedBudget}</h2>
          <p>האם את/ה מאשר/ת ורוצה להתחיל?</p>
          <button onClick={handleSave} className="start-btn">כן, בואו נתחיל!</button>
          <button onClick={() => setStep(2)} className="start-btn" style={{ backgroundColor: '#475569', marginTop: '10px' }}>חזרה לראיון</button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="onboarding">
        <div className="onboarding-card" style={{ maxWidth: '450px' }}>
          <h1>ראיון היכרות (כדי שזינה תכיר אותך)</h1>
          <p>כדי לתת לך את התשובות הכי מדויקות, זינה צריכה לדעת עוד קצת עלייך.</p>
          
          <form onSubmit={handleInterviewNext}>
            <div className="form-group">
              <label>לו"ז אימונים: ימים ושעות קבועים</label>
              <input 
                type="text" 
                value={formData.workoutSchedule} 
                onChange={e => setFormData({...formData, workoutSchedule: e.target.value})}
                placeholder="לדוגמה: ספינינג בחמישי בערב"
              />
            </div>
            
            <div className="form-group">
              <label>מבנה ארוחות: איך היום נראה?</label>
              <input 
                type="text" 
                value={formData.mealStructure} 
                onChange={e => setFormData({...formData, mealStructure: e.target.value})}
                placeholder="לדוגמה: לא אוכל בוקר, מנשנש כבד בלילה"
              />
            </div>

            <div className="form-group">
              <label>נקודות תורפה: מה המאכל ששובר אותך?</label>
              <input 
                type="text" 
                value={formData.weakness} 
                onChange={e => setFormData({...formData, weakness: e.target.value})}
                placeholder="לדוגמה: במבה נוגט, שוקולד"
              />
            </div>

            <button type="submit" className="start-btn">המשך לחישוב תקציב</button>
            <button type="button" onClick={() => setStep(1)} className="start-btn" style={{ backgroundColor: '#475569', marginTop: '10px' }}>חזרה לשלב הקודם</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding">
      <div className="onboarding-card" style={{ maxWidth: '450px' }}>
        <h1>ברוכים הבאים לזינה AI</h1>
        <p>בואו נגדיר את הפרופיל שלכם כדי שזינה תוכל להתחיל לעזור (או לצעוק עליכם).</p>
        
        <form onSubmit={handleNext}>
          <div className="form-group">
            <label>שם:</label>
            <input 
              type="text" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})}
              required 
              placeholder="איך קוראים לך?"
            />
          </div>
          
          <div className="form-group">
            <label>מגדר (בשביל הפנייה והחישוב):</label>
            <select 
              value={formData.gender} 
              onChange={e => setFormData({...formData, gender: e.target.value})}
            >
              <option value="זכר">זכר</option>
              <option value="נקבה">נקבה</option>
            </select>
          </div>

          <div className="form-group" style={{ display: 'flex', gap: '10px', textAlign: 'right' }}>
            <div style={{ flex: 1 }}>
              <label>גיל:</label>
              <input 
                type="number" 
                value={formData.age} 
                onChange={e => setFormData({...formData, age: e.target.value})}
                required 
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>גובה (ס"מ):</label>
              <input 
                type="number" 
                value={formData.height} 
                onChange={e => setFormData({...formData, height: e.target.value})}
                required 
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>משקל (ק"ג):</label>
              <input 
                type="number" 
                value={formData.weight} 
                onChange={e => setFormData({...formData, weight: e.target.value})}
                required 
              />
            </div>
          </div>

          <div className="form-group">
            <label>רמת פעילות:</label>
            <select 
              value={formData.activityLevel} 
              onChange={e => setFormData({...formData, activityLevel: e.target.value})}
            >
              <option value="1.2">יושבני (ללא פעילות גופנית)</option>
              <option value="1.375">פעילות קלה (1-3 פעמים בשבוע)</option>
              <option value="1.55">פעילות בינונית (3-5 פעמים בשבוע)</option>
              <option value="1.725">פעילות רבה (6-7 פעמים בשבוע)</option>
            </select>
          </div>

          <button type="submit" className="start-btn">חשב תקציב קלוריות</button>
        </form>
      </div>
    </div>
  );
}
