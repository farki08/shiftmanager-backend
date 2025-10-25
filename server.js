const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuration Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Configuration Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Route de test
app.get('/', (req, res) => {
  res.json({ message: 'ShiftManager Backend API is running!' });
});

// Endpoint : Créer une période et envoyer emails
app.post('/api/periods', async (req, res) => {
  const { name, dates, deadline } = req.body;
  
  try {
    // 1. Créer la période dans la base
    const { data: period, error: periodError } = await supabase
      .from('periods')
      .insert({
        name,
        start_date: dates[0],
        end_date: dates[dates.length - 1],
        deadline
      })
      .select()
      .single();
    
    if (periodError) throw periodError;
    
    // 2. Récupérer tous les livreurs
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('*');
    
    if (driversError) throw driversError;
    
    // 3. Envoyer un email à chaque livreur
    const emailPromises = drivers.map(driver => {
      const link = `https://ton-app.com/driver/${period.id}/${driver.id}`;
      
      return resend.emails.send({
        from: 'ShiftManager <onboarding@resend.dev>',
        to: driver.email,
        subject: `📅 Nouvelles disponibilités à remplir - ${name}`,
        html: `
          <h2>Bonjour ${driver.first_name} !</h2>
          <p>Une nouvelle période de planning est disponible : <strong>${name}</strong></p>
          <p>Merci de remplir vos disponibilités avant le <strong>${new Date(deadline).toLocaleDateString('fr-FR')}</strong>.</p>
          <p><a href="${link}" style="background: #0066CC; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">📝 Remplir mes disponibilités</a></p>
          <p>À bientôt,<br>L'équipe ShiftManager</p>
        `
      });
    });
    
    await Promise.all(emailPromises);
    
    res.json({ success: true, period, emailsSent: drivers.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint : Soumettre les disponibilités
app.post('/api/availabilities', async (req, res) => {
  const { driverId, periodId, selectedDates, selectedSlots } = req.body;
  
  try {
    const { data, error } = await supabase
      .from('availabilities')
      .insert({
        driver_id: driverId,
        period_id: periodId,
        selected_dates: selectedDates,
        selected_slots: selectedSlots
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Mettre à jour le statut du livreur
    await supabase
      .from('drivers')
      .update({ status: 'Répondu' })
      .eq('id', driverId);
    
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur le port ${PORT}`);
});
