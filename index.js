import { google } from 'googleapis';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';

dotenv.config();

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

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
      likesLast15Days: recentVideosStats.likes,
      dateGenerated: new Date().toISOString()
    };

    // Sauvegarder les statistiques dans un fichier
    writeFileSync('youtube-stats.json', JSON.stringify(stats, null, 2));
    
    console.log('Statistiques YouTube :');
    console.log('------------------------');
    console.log(`Nombre d'abonnés total: ${stats.totalSubscribers}`);
    console.log(`Nouvelles vidéos (15 derniers jours): ${stats.newVideosLast15Days}`);
    console.log(`Vues totales (15 derniers jours): ${stats.viewsLast15Days}`);
    console.log(`Likes totaux (15 derniers jours): ${stats.likesLast15Days}`);

  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error.message);
  }
}

getChannelStats();