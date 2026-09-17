// Demo data for local development and screenshots. Loaded only on localhost.
import { toISODate } from './format.js';

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return toISODate(d); }

export function seed(store, name = 'demo') {
  if (name === 'empty') {
    store.replaceState({ settings: { onboarded: true, migratedLegacy: true } });
    return;
  }
  const base = { version: 2, settings: { units: 'mi', defaultPurpose: 'business', theme: 'system', onboarded: true, migratedLegacy: true }, vehicles: [], routes: [], trips: [] };
  store.replaceState(base);
  const civic = store.addVehicle({ name: 'Honda Civic', plate: '8ABC123', odometer: 48210, isDefault: true });
  const transit = store.addVehicle({ name: 'Ford Transit', plate: '7XYZ987', odometer: 112400 });

  const R = {
    office: store.saveRoute({ from: 'Home', to: 'Office · Redwood City', distanceMi: 12.4, purpose: 'business' }),
    home: store.saveRoute({ from: 'Office · Redwood City', to: 'Home', distanceMi: 12.4, purpose: 'business' }),
    client: store.saveRoute({ from: 'Office · Redwood City', to: 'Client · Palo Alto', distanceMi: 8.7, purpose: 'business' }),
    sfo: store.saveRoute({ from: 'Home', to: 'SFO', distanceMi: 24.1, purpose: 'business' }),
    stanford: store.saveRoute({ from: 'Home', to: 'Stanford Medical Center', distanceMi: 6.3, purpose: 'medical' }),
    foodbank: store.saveRoute({ from: 'Home', to: 'Second Harvest Food Bank', distanceMi: 9.8, purpose: 'charity' }),
  };

  const plan = [
    // [daysAgo, routeKey | {from,to,distanceMi,purpose}, vehicle, roundTrip, notes]
    [0, 'office', civic, false, ''],
    [0, 'client', civic, true, 'Q3 review with Meridian'],
    [1, 'office', civic, true, ''],
    [2, { from: 'Home', to: 'Half Moon Bay', distanceMi: 27.5, purpose: 'personal' }, civic, true, 'Coastal shoot'],
    [3, 'office', civic, true, ''],
    [4, 'sfo', civic, false, 'Flight to Seattle, client onsite'],
    [6, 'stanford', civic, true, 'Follow-up appointment'],
    [7, 'office', civic, true, ''],
    [8, { from: 'Office · Redwood City', to: 'Supplier · San Jose', distanceMi: 22.6, purpose: 'business' }, transit, true, 'Pick up display units'],
    [9, 'office', civic, true, ''],
    [10, 'foodbank', civic, true, 'Saturday volunteer shift'],
    [11, 'client', civic, true, ''],
    [13, 'office', civic, true, ''],
    [14, { from: 'Home', to: 'Costco · Mountain View', distanceMi: 5.2, purpose: 'personal' }, civic, true, ''],
    [15, 'office', civic, true, ''],
    [16, 'sfo', civic, true, 'Airport run'],
    [17, 'office', civic, true, ''],
    [20, 'client', civic, true, 'Design review'],
    [21, 'office', civic, true, ''],
    [22, 'office', civic, true, ''],
    [24, { from: 'Office · Redwood City', to: 'Print shop · San Mateo', distanceMi: 6.9, purpose: 'business' }, transit, true, ''],
    [27, 'office', civic, true, ''],
    [28, 'stanford', civic, true, ''],
    [29, 'office', civic, true, ''],
    [31, 'client', civic, true, ''],
    [33, 'office', civic, true, ''],
    [35, 'office', civic, true, ''],
    [36, { from: 'Home', to: 'Lake Tahoe', distanceMi: 214, purpose: 'personal' }, civic, true, 'Long weekend'],
    [41, 'office', civic, true, ''],
    [42, 'foodbank', civic, true, ''],
    [43, 'office', civic, true, ''],
    [45, 'sfo', civic, false, ''],
    [48, 'office', civic, true, ''],
    [49, 'client', civic, true, ''],
    [50, 'office', civic, true, ''],
    [55, 'office', civic, true, ''],
    [56, { from: 'Office · Redwood City', to: 'Trade show · Santa Clara', distanceMi: 18.3, purpose: 'business' }, transit, true, 'Booth setup'],
    [57, 'office', civic, true, ''],
    [62, 'office', civic, true, ''],
    [63, 'stanford', civic, true, ''],
    [64, 'office', civic, true, ''],
    [70, 'office', civic, true, ''],
    [71, 'client', civic, true, ''],
    [77, 'office', civic, true, ''],
    [78, 'office', civic, true, ''],
    [84, 'sfo', civic, true, ''],
    [85, 'office', civic, true, ''],
    [91, 'office', civic, true, ''],
    [92, 'office', civic, true, ''],
    [98, 'office', civic, true, ''],
    [99, 'client', civic, true, ''],
    [105, 'office', civic, true, ''],
    [112, 'office', civic, true, ''],
    [119, 'office', civic, true, ''],
    [126, 'office', civic, true, ''],
    [133, 'office', civic, true, ''],
    [140, 'office', civic, true, ''],
    // prior year, so the Summary year stepper has somewhere to go
    [300, 'office', civic, true, ''],
    [301, 'client', civic, true, 'Year-end review'],
    [307, 'office', civic, true, ''],
    [314, 'sfo', civic, true, ''],
    [321, 'office', civic, true, ''],
    [328, 'stanford', civic, true, ''],
    [335, 'office', civic, true, ''],
    [342, { from: 'Home', to: 'Lake Tahoe', distanceMi: 214, purpose: 'personal' }, civic, true, 'Thanksgiving'],
    [349, 'office', civic, true, ''],
    [356, 'foodbank', civic, true, ''],
  ];

  for (const [ago, r, vehicle, roundTrip, notes] of plan) {
    const src = typeof r === 'string' ? R[r] : r;
    const distanceMi = src.distanceMi * (roundTrip ? 2 : 1);
    store.addTrip({ date: daysAgo(ago), from: src.from, to: src.to, distanceMi, purpose: src.purpose, vehicleId: vehicle.id, roundTrip, notes, routeId: typeof r === 'string' ? src.id : null });
  }
}
