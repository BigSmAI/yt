import cron from 'node-cron';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration de l'authentification YouTube
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

// Configuration de l'authentification Google Sheets
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

async function appendToSheet(stats) {
  try {
    const date = new Date().toLocaleDateString('fr-FR');
    const time = new Date().toLocaleTimeString('fr-FR');
    
    const values = [[
      date,
      time,
      stats.totalSubscribers,
      stats.newVideosLast15Days,
      stats.viewsLast15Days,
      stats.likesLast15Days
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Statistiques!A:F',
      valueInputOption: 'USER_ENTERED',
      resource: { values }
    });

    console.log(`[${date} ${time}] Données ajoutées à la Google Sheet`);
  } catch (error) {
    console.error('Erreur lors de l\'ajout à la Google Sheet:', error.message);
  }
}

async function getChannelStats() {
  try {
    // Obtenir les statistiques de la chaîne
    const channelResponse = await youtube.channels.list({
      part: 'statistics',
      id: process.env.CHANNEL_ID
    });

    const channelStats = channelResponse.data.items[0].statistics;
    
    // Obtenir la date d'il y a 15 jours
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    
    // Obtenir les vidéos publiées ces 15 derniers jours
    const videosResponse = await youtube.search.list({
      part: 'id',
      channelId: process.env.CHANNEL_ID,
      order: 'date',
      publishedAfter: fifteenDaysAgo.toISOString(),
      type: 'video',
      maxResults: 50
    });

    const videoIds = videosResponse.data.items.map(item => item.id.videoId);
    
    // Obtenir les statistiques détaillées des vidéos
    const videoStats = await youtube.videos.list({
      part: 'statistics',
      id: videoIds.join(',')
    });

    // Calculer les totaux
    const recentVideosStats = videoStats.data.items.reduce((acc, video) => {
      return {
        views: acc.views + parseInt(video.statistics.viewCount),
        likes: acc.likes + parseInt(video.statistics.likeCount)
      };
    }, { views: 0, likes: 0 });

    const stats = {
      totalSubscribers: parseInt(channelStats.subscriberCount),
      newVideosLast15Days: videoIds.length,
      viewsLast15Days: recentVideosStats.views,
      likesLast15Days: recentVideosStats.likes
    };

    // Ajouter les statistiques à la Google Sheet
    await appendToSheet(stats);
    
    return stats;
  } catch (error) {
    console.error('Erreur:', error.message);
    return null;
  }
}

// Route pour vérifier que le service fonctionne
app.get('/', (req, res) => {
  res.json({ status: 'Service en ligne' });
});

// Route pour déclencher manuellement la collecte
app.get('/collect', async (req, res) => {
  const stats = await getChannelStats();
  res.json(stats || { error: 'Erreur lors de la collecte' });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`Service démarré sur le port ${PORT}`);
  
  // Exécuter immédiatement au démarrage
  console.log('Démarrage du service de surveillance YouTube...');
  getChannelStats();

  // Planifier l'exécution toutes les 6 heures
  cron.schedule('0 */6 * * *', () => {
    console.log(`\n[${new Date().toLocaleString()}] Exécution planifiée du script...`);
    getChannelStats();
  });
});