import {one} from '../lib/db';
import {areaSuggestions} from '../lib/map-area-suggestions';
const trip=one('SELECT id,owner_id FROM trips WHERE id=?',process.argv[2]);
if(!trip)throw Error('Trip not found');
const result=await areaSuggestions(trip.id,trip.owner_id);
console.log(JSON.stringify({incomplete:result.incomplete,candidates:result.candidates.map(c=>({title:c.title,kind:c.kind,photos:c.photoIds.length}))}));
