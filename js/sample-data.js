// ---------------------------------------------------------------------------
// Sample data used for demo mode and for seeding a fresh Firebase project.
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  { id: 'rice-noodles', name: 'Rice & Noodles', icon: '🍜' },
  { id: 'main-course', name: 'Main Course', icon: '🍗' },
  { id: 'snacks', name: 'Snacks', icon: '🥟' },
  { id: 'desserts', name: 'Desserts', icon: '🍧' },
  { id: 'drinks', name: 'Drinks', icon: '🥤' },
  { id: 'kuih', name: 'Kuih-Muih', icon: '🍡' },
  { id: 'combo', name: 'Combo Meals', icon: '🍱' },
];

const PORTION = { name: 'Portion', options: [{ label: 'Regular', price: 0 }, { label: 'Large', price: 2 }] };
const SPICE = { name: 'Spice Level', options: [{ label: 'Original', price: 0 }, { label: 'Kurang Pedas', price: 0 }, { label: 'Extra Pedas', price: 0 }] };
const TEMP = { name: 'Temperature', options: [{ label: 'Iced', price: 0 }, { label: 'Hot', price: -0.5 }] };
const SUGAR = { name: 'Sweetness', options: [{ label: 'Normal', price: 0 }, { label: 'Kurang Manis', price: 0 }, { label: 'Kosong', price: 0 }] };
const PCS = (a, b, extra) => ({ name: 'Pieces', options: [{ label: a, price: 0 }, { label: b, price: extra }] });

let t = Date.now() - 1000 * 60 * 60 * 24 * 30;
const at = () => (t += 1000 * 60 * 60 * 20);

export const SAMPLE_MENU = [
  { id: 'm01', name: 'Nasi Lemak Ayam Goreng', category: 'rice-noodles', price: 12.9, art: 'nasi-lemak-ayam', desc: 'Fragrant coconut rice with crispy fried chicken, house sambal, boiled egg, peanuts, anchovies and cucumber.', available: true, featured: true, popular: true, recommended: true, rating: 4.9, prepMin: 15, kcal: 820, serves: 1, variants: [PORTION, SPICE] },
  { id: 'm02', name: 'Nasi Lemak Biasa', category: 'rice-noodles', price: 6.5, art: 'nasi-lemak', desc: 'The classic — santan rice, sambal ikan bilis, half egg, peanuts and fresh cucumber.', available: true, popular: true, rating: 4.7, prepMin: 10, kcal: 540, serves: 1, variants: [PORTION, SPICE] },
  { id: 'm03', name: 'Mee Goreng Mamak', category: 'rice-noodles', price: 9.9, art: 'mee-goreng', desc: 'Wok-fried yellow noodles with tofu, potato, egg and a squeeze of lime, mamak style.', available: true, featured: true, recommended: true, rating: 4.6, prepMin: 12, kcal: 680, serves: 1, variants: [PORTION, SPICE] },
  { id: 'm04', name: 'Char Kuey Teow', category: 'rice-noodles', price: 11.9, art: 'char-kuey-teow', desc: 'Smoky flat rice noodles with prawns, bean sprouts, chives and egg — full of wok hei.', available: true, popular: true, rating: 4.8, prepMin: 12, kcal: 740, serves: 1, variants: [PORTION, SPICE] },
  { id: 'm05', name: 'Nasi Goreng Kampung', category: 'rice-noodles', price: 10.9, art: 'nasi-goreng', desc: 'Village-style fried rice with kangkung, anchovies and a sunny-side-up egg.', available: true, rating: 4.5, prepMin: 12, kcal: 650, serves: 1, variants: [PORTION, SPICE] },
  { id: 'm06', name: 'Rendang Daging', category: 'main-course', price: 15.9, art: 'rendang', desc: 'Slow-cooked beef in rich coconut and kerisik gravy, simmered for hours with spices.', available: true, featured: true, recommended: true, rating: 4.9, prepMin: 10, kcal: 590, serves: 1, variants: [{ name: 'Add Rice', options: [{ label: 'No Rice', price: 0 }, { label: 'White Rice', price: 2 }, { label: 'Nasi Minyak', price: 3.5 }] }] },
  { id: 'm07', name: 'Ayam Goreng Berempah', category: 'main-course', price: 8.9, art: 'ayam-goreng', desc: 'Crispy spiced fried chicken marinated with lemongrass, turmeric and curry leaves.', available: true, popular: true, rating: 4.7, prepMin: 15, kcal: 610, serves: 1, variants: [PCS('2 pcs', '3 pcs', 4)] },
  { id: 'm08', name: 'Roti Canai Set', category: 'main-course', price: 5.5, art: 'roti-canai', desc: 'Two flaky roti canai served with dhal and chicken curry.', available: true, rating: 4.6, prepMin: 8, kcal: 480, serves: 1, variants: [{ name: 'Type', options: [{ label: 'Kosong', price: 0 }, { label: 'Telur', price: 1.5 }, { label: 'Bawang', price: 1 }] }] },
  { id: 'm09', name: 'Satay Ayam (10 cucuk)', category: 'main-course', price: 14, art: 'satay', desc: 'Charcoal-grilled chicken skewers with peanut sauce, cucumber and onion.', available: true, recommended: true, rating: 4.8, prepMin: 20, kcal: 700, serves: 2, variants: [{ name: 'Add-on', options: [{ label: 'None', price: 0 }, { label: 'Nasi Impit', price: 2.5 }] }] },
  { id: 'm10', name: 'Karipap Pusing (4 pcs)', category: 'snacks', price: 4, art: 'karipap', desc: 'Spiral flaky curry puffs filled with spiced potato and chicken.', available: true, popular: true, rating: 4.6, prepMin: 5, kcal: 380, serves: 2, variants: [] },
  { id: 'm11', name: 'Popia Goreng (5 pcs)', category: 'snacks', price: 5, art: 'popia', desc: 'Crispy spring rolls stuffed with jicama and carrot, served with chilli dip.', available: true, rating: 4.4, prepMin: 6, kcal: 350, serves: 2, variants: [] },
  { id: 'm12', name: 'Pisang Goreng', category: 'snacks', price: 4.5, art: 'pisang-goreng', desc: 'Golden banana fritters, crispy outside and soft inside.', available: true, rating: 4.5, prepMin: 6, kcal: 320, serves: 2, variants: [{ name: 'Topping', options: [{ label: 'Plain', price: 0 }, { label: 'Cheese', price: 2 }] }] },
  { id: 'm13', name: 'Cendol Pulut', category: 'desserts', price: 6.9, art: 'cendol', desc: 'Pandan jelly, glutinous rice, coconut milk and gula Melaka over shaved ice.', available: true, featured: true, popular: true, rating: 4.9, prepMin: 5, kcal: 420, serves: 1, variants: [{ name: 'Add-on', options: [{ label: 'None', price: 0 }, { label: 'Durian', price: 3 }, { label: 'Red Bean', price: 1 }] }] },
  { id: 'm14', name: 'Ais Batu Campur (ABC)', category: 'desserts', price: 7.5, art: 'abc', desc: 'Shaved ice mountain with rose syrup, gula Melaka, corn, jelly and peanuts.', available: true, rating: 4.5, prepMin: 5, kcal: 390, serves: 1, variants: [] },
  { id: 'm15', name: 'Teh Tarik', category: 'drinks', price: 3.5, art: 'teh-tarik', desc: 'Frothy pulled milk tea — Malaysia’s favourite.', available: true, popular: true, rating: 4.8, prepMin: 3, kcal: 160, serves: 1, variants: [TEMP, SUGAR] },
  { id: 'm16', name: 'Iced Lemon Tea', category: 'drinks', price: 4.5, art: 'lemon-tea', desc: 'Freshly brewed tea with real lemon and ice.', available: true, rating: 4.5, prepMin: 3, kcal: 110, serves: 1, variants: [SUGAR] },
  { id: 'm17', name: 'Sirap Bandung', category: 'drinks', price: 3.8, art: 'bandung', desc: 'Rose syrup with evaporated milk, served ice cold.', available: true, rating: 4.4, prepMin: 3, kcal: 180, serves: 1, variants: [SUGAR] },
  { id: 'm18', name: 'Kopi O Ais', category: 'drinks', price: 3.2, art: 'kopi', desc: 'Strong local black coffee over ice.', available: true, rating: 4.5, prepMin: 3, kcal: 60, serves: 1, variants: [TEMP, SUGAR] },
  { id: 'm19', name: 'Kuih Lapis (5 pcs)', category: 'kuih', price: 5, art: 'kuih-lapis', desc: 'Soft, chewy steamed layer cake — peel one layer at a time.', available: true, rating: 4.6, prepMin: 2, kcal: 300, serves: 2, variants: [] },
  { id: 'm20', name: 'Onde-Onde (6 pcs)', category: 'kuih', price: 5, art: 'onde-onde', desc: 'Pandan glutinous rice balls bursting with gula Melaka, rolled in coconut.', available: true, popular: true, rating: 4.8, prepMin: 2, kcal: 280, serves: 2, variants: [] },
  { id: 'm21', name: 'Seri Muka (2 pcs)', category: 'kuih', price: 6, art: 'seri-muka', desc: 'Pandan custard on a layer of glutinous rice.', available: false, rating: 4.7, prepMin: 2, kcal: 320, serves: 1, variants: [] },
  { id: 'm22', name: 'Combo Nasi Lemak + Teh Tarik', category: 'combo', price: 14.9, art: 'combo-nasi-lemak', desc: 'Nasi Lemak Ayam Goreng with a Teh Tarik. Save RM 1.50!', available: true, featured: true, recommended: true, rating: 4.9, prepMin: 15, kcal: 980, serves: 1, variants: [SPICE, TEMP] },
  { id: 'm23', name: 'Combo Mee Goreng + Lemon Tea', category: 'combo', price: 12.9, art: 'combo-mee', desc: 'Mee Goreng Mamak paired with Iced Lemon Tea.', available: true, rating: 4.6, prepMin: 12, kcal: 790, serves: 1, variants: [SPICE] },
  { id: 'm24', name: 'Family Satay Combo', category: 'combo', price: 39.9, art: 'combo-satay', desc: '30 sticks of chicken & beef satay, nasi impit, peanut sauce — feeds 3–4.', available: true, popular: true, rating: 4.9, prepMin: 25, kcal: 2100, serves: 4, variants: [] },
].map((m) => ({ image: '', featured: false, popular: false, recommended: false, ...m, createdAt: at() }));

export const DEFAULT_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00',
  '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00',
];

export const DEFAULT_SETTINGS = {
  shopName: 'PICK UP N GO',
  tagline: 'Pre-order. Skip the queue. Grab & go.',
  whatsapp: '60123456789',
  phone: '012-345 6789',
  autoWhatsApp: true,
  // 0 = Sunday ... 6 = Saturday
  businessHours: {
    0: { closed: true, open: '09:00', close: '17:00' },
    1: { closed: false, open: '09:00', close: '17:00' },
    2: { closed: false, open: '09:00', close: '17:00' },
    3: { closed: false, open: '09:00', close: '17:00' },
    4: { closed: false, open: '09:00', close: '17:00' },
    5: { closed: false, open: '09:00', close: '17:00' },
    6: { closed: false, open: '09:00', close: '14:00' },
  },
  slots: DEFAULT_SLOTS,
  disabledSlots: [],
  maxPerSlot: 5,
  prepTime: 30,
  maxAdvanceDays: 7,
  blockedDates: [],
  locations: [
    { id: 'main', name: 'Main Counter — Jalan Tun Razak', address: 'Lot 12, Jalan Tun Razak, 50400 Kuala Lumpur' },
    { id: 'kiosk', name: 'Pickup Kiosk — KLCC Food Court', address: 'Level 2, Suria KLCC, 50088 Kuala Lumpur' },
  ],
  payments: { cash: true, duitnow: true, online: true },
  duitnowQR: '',
  duitnowName: 'PICK UP N GO ENTERPRISE',
  duitnowId: '0123456789',
  paymentInstructions: 'Scan the DuitNow QR with any banking or e-wallet app, pay the exact Grand Total, then upload a screenshot of your receipt.',
  promos: [
    { code: 'PNG10', type: 'percent', value: 10, minSpend: 20, active: true },
    { code: 'JIMAT5', type: 'fixed', value: 5, minSpend: 40, active: true },
  ],
};

export const DEMO_USERS = [
  { id: 'u_admin', name: 'Admin Kedai', email: 'admin@pickupngo.my', password: 'admin123', role: 'admin', phone: '0123456789' },
  { id: 'u_staff', name: 'Staff Kaunter', email: 'staff@pickupngo.my', password: 'staff123', role: 'staff', phone: '0198765432' },
];
