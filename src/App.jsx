import { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import Onboarding from './components/Onboarding';
import { saveToSheet } from './services/aiService';

function App() {
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const profile = localStorage.getItem('userProfile');
    if (profile) {
      setUserProfile(JSON.parse(profile));
    }
    setLoading(false);
  }, []);

  const handleSaveProfile = async (profileData) => {
    // Save full profile
    localStorage.setItem('userProfile', JSON.stringify(profileData));
    
    // Save lifestyleContext specifically as requested
    if (profileData.lifestyleContext) {
      localStorage.setItem('lifestyleContext', JSON.stringify(profileData.lifestyleContext));
    }

    setUserProfile(profileData);
    // Send onboarding data to Google Sheets
    await saveToSheet(profileData);
  };

  if (loading) return null;

  return (
    <div className="app-container">
      {userProfile ? (
        <ChatInterface userProfile={userProfile} />
      ) : (
        <Onboarding onSave={handleSaveProfile} />
      )}
    </div>
  );
}

export default App;
