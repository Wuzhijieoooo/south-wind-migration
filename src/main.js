import './styles/main.css';
import { GameController } from './game/game-controller.js';

const root = document.querySelector('#app');
const game = new GameController(root).mount();

window.__southWindGame = game;
