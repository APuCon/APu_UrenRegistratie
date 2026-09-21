import { endpoint } from '../lib/http';

// Wie ben ik? De frontend gebruikt dit om te bepalen welke menu-items zichtbaar zijn.
endpoint('me', 'GET', 'me', 'user', async ({ user }) => user);
