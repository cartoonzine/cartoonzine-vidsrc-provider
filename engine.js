const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY; 
const VIDSRC_BASE = "https://vidsrc.sh/embed";

const VIDSRC_MOVIES_LIST = "https://vidsrc.sh/ids/movie_imdb.txt";
const VIDSRC_TV_LIST = "https://vidsrc.sh/ids/tv_imdb.txt";

const MOVIES_OUT = path.join(__dirname, 'movies.json');
const SERIES_OUT = path.join(__dirname, 'series.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchFromTMDB(url) {
  try {
    const res = await axios.get(url);
    return res.data;
  } catch (error) {
    return null;
  }
}

async function buildEngine() {
  console.log("Iniciando o Motor Cartoonzine VidSrc Provider...");

  const moviesRaw = await axios.get(VIDSRC_MOVIES_LIST);
  const seriesRaw = await axios.get(VIDSRC_TV_LIST);
  
  // Pegando os 50 primeiros para teste inicial (você pode aumentar depois)
  const movieIds = moviesRaw.data.split('\n').map(id => id.trim()).filter(Boolean).slice(0, 50);
  const seriesIds = seriesRaw.data.split('\n').map(id => id.trim()).filter(Boolean).slice(0, 50);

  const moviesDB = [];
  const seriesDB = [];

  console.log(`Processando ${movieIds.length} Filmes...`);
  for (const imdbId of movieIds) {
    const findData = await fetchFromTMDB(`https://api.themoviedb.org/3/find/\({imdbId}?api_key=\){TMDB_API_KEY}&external_source=imdb_id&language=pt-BR`);
    
    if (findData && findData.movie_results.length > 0) {
      const tmdbMovie = findData.movie_results[0];
      const movieDetails = await fetchFromTMDB(`https://api.themoviedb.org/3/movie/\({tmdbMovie.id}?api_key=\){TMDB_API_KEY}&language=pt-BR`);
      
      if (movieDetails) {
        moviesDB.push({
          cat: "Filmes",
          title: `\({movieDetails.title} (\){movieDetails.release_date ? movieDetails.release_date.split('-')[0] : ""})`,
          desc: movieDetails.overview || "Sinopse em breve...",
          thumb: movieDetails.poster_path ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}` : "",
          bannerThumb: movieDetails.backdrop_path ? `https://image.tmdb.org/t/p/w500${movieDetails.backdrop_path}` : "",
          url: `\({VIDSRC_BASE}/movie/\){imdbId}`,
          year: movieDetails.release_date ? movieDetails.release_date.split('-')[0] : "",
          genre: movieDetails.genres.length > 0 ? movieDetails.genres[0].name : "Filme",
          destaque: false
        });
        console.log(`[Filme] ${movieDetails.title} adicionado.`);
      }
    }
    await delay(150);
  }

  console.log(`Processando ${seriesIds.length} Séries...`);
  for (const imdbId of seriesIds) {
    const findData = await fetchFromTMDB(`https://api.themoviedb.org/3/find/\({imdbId}?api_key=\){TMDB_API_KEY}&external_source=imdb_id&language=pt-BR`);
    
    if (findData && findData.tv_results.length > 0) {
      const tmdbShow = findData.tv_results[0];
      const showDetails = await fetchFromTMDB(`https://api.themoviedb.org/3/tv/\({tmdbShow.id}?api_key=\){TMDB_API_KEY}&language=pt-BR`);
      
      if (showDetails) {
        const seasonsArray = [];

        for (const season of showDetails.seasons) {
          if (season.season_number === 0) continue; 
          const episodesArray = [];
          for (let ep = 1; ep <= season.episode_count; ep++) {
            episodesArray.push({
              season: season.season_number,
              episode: ep,
              url: `\({VIDSRC_BASE}/tv/\){imdbId}/\({season.season_number}/\){ep}`
            });
          }
          if (episodesArray.length > 0) {
            seasonsArray.push({ season: season.season_number, episodes: episodesArray });
          }
        }

        seriesDB.push({
          cat: "Séries",
          title: showDetails.name,
          desc: showDetails.overview || "Sinopse em breve...",
          thumb: showDetails.poster_path ? `https://image.tmdb.org/t/p/w500${showDetails.poster_path}` : "",
          bannerThumb: showDetails.backdrop_path ? `https://image.tmdb.org/t/p/w500${showDetails.backdrop_path}` : "",
          year: showDetails.first_air_date ? showDetails.first_air_date.split('-')[0] : "",
          genre: showDetails.genres.length > 0 ? showDetails.genres[0].name : "Série",
          destaque: false,
          seasons: seasonsArray
        });
        console.log(`[Série] ${showDetails.name} adicionada.`);
      }
    }
    await delay(150);
  }

  fs.writeFileSync(MOVIES_OUT, JSON.stringify(moviesDB, null, 2));
  fs.writeFileSync(SERIES_OUT, JSON.stringify(seriesDB, null, 2));
  console.log("Geração concluída com sucesso!");
}

buildEngine();