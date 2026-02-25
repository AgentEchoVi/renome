const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'renome.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// CREATE TABLES
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_ru TEXT,
    slug TEXT UNIQUE NOT NULL,
    icon TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    name TEXT NOT NULL,
    name_ru TEXT,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    description_ru TEXT,
    price REAL NOT NULL DEFAULT 0,
    old_price REAL,
    image TEXT,
    weight TEXT,
    is_popular INTEGER DEFAULT 0,
    is_new INTEGER DEFAULT 0,
    is_available INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    delivery_address TEXT,
    delivery_type TEXT DEFAULT 'delivery',
    total REAL DEFAULT 0,
    payment_method TEXT DEFAULT 'cash',
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    menu_item_id INTEGER,
    name TEXT,
    quantity INTEGER DEFAULT 1,
    price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
  );
`);

// ============================================================
// MIGRATIONS — add missing columns to existing tables
// ============================================================
function columnExists(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}

if (!columnExists('orders', 'user_id'))          db.exec('ALTER TABLE orders ADD COLUMN user_id INTEGER');
if (!columnExists('orders', 'customer_email'))    db.exec('ALTER TABLE orders ADD COLUMN customer_email TEXT');
if (!columnExists('orders', 'delivery_address'))  db.exec('ALTER TABLE orders ADD COLUMN delivery_address TEXT');
if (!columnExists('orders', 'delivery_type'))     db.exec('ALTER TABLE orders ADD COLUMN delivery_type TEXT DEFAULT \'delivery\'');
if (!columnExists('order_items', 'name'))         db.exec('ALTER TABLE order_items ADD COLUMN name TEXT');

// Rename old column if exists (customer_address → delivery_address)
if (columnExists('orders', 'customer_address') && !columnExists('orders', 'delivery_address')) {
  db.exec('ALTER TABLE orders RENAME COLUMN customer_address TO delivery_address');
}

// ============================================================
// SEED ADMIN USER
// ============================================================

const adminPassword = crypto.createHash('sha256').update('admin123').digest('hex');

const insertUser = db.prepare('INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, ?)');
insertUser.run('admin@renome.md', adminPassword, 'Admin', 'admin');

const staffPassword = crypto.createHash('sha256').update('staff123').digest('hex');
insertUser.run('staff@renome.md', staffPassword, 'Staff', 'staff');

// ============================================================
// SEED CATEGORIES
// ============================================================

const existingCount = db.prepare('SELECT COUNT(*) as cnt FROM categories').get().cnt;

if (existingCount === 0) {

const insertCat = db.prepare('INSERT INTO categories (name, name_ru, slug, icon, sort_order) VALUES (?, ?, ?, ?, ?)');

const seedCategories = db.transaction(() => {
  insertCat.run('Pizza',            'Пицца',             'pizza',          'pizza',     1);
  insertCat.run('Paste',            'Паста',             'paste',          'pasta',     2);
  insertCat.run('Risotto',          'Ризотто',           'risotto',        'risotto',   3);
  insertCat.run('Antipasti',        'Антипасти',         'antipasti',      'antipasti', 4);
  insertCat.run('Insalate',         'Салаты',            'insalate',       'salad',     5);
  insertCat.run('Supe',             'Супы',              'supe',           'soup',      6);
  insertCat.run('Carne & Pește',    'Мясо и Рыба',      'carne-peste',    'main',      7);
  insertCat.run('Deserturi',        'Десерты',           'deserturi',      'dessert',   8);
  insertCat.run('Băuturi',          'Напитки',           'bauturi',        'drink',     9);
  insertCat.run('Vin & Cocktail',   'Вино и Коктейли',  'vin-cocktail',   'cocktail', 10);
});

seedCategories();

// ============================================================
// SEED MENU ITEMS
// ============================================================

const ins = db.prepare(`
  INSERT INTO menu_items
    (category_id, name, name_ru, slug, description, description_ru, price, old_price, image, weight, is_popular, is_new, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const seedItems = db.transaction(() => {

  // ----------------------------------------------------------
  // 1. Pizza (category_id = 1) — 15 items
  // ----------------------------------------------------------
  ins.run(1, 'Pizza Margherita', 'Пицца Маргарита', 'pizza-margherita',
    'Sos de roșii, mozzarella, busuioc proaspăt',
    'Томатный соус, моцарелла, свежий базилик',
    120, null, '/img/menu/pizza-1.jpg', '400g', 1, 0, 1);

  ins.run(1, 'Pizza Pepperoni', 'Пицца Пепперони', 'pizza-pepperoni',
    'Sos de roșii, mozzarella, pepperoni picant',
    'Томатный соус, моцарелла, острый пепперони',
    140, null, '/img/menu/pizza-2.jpg', '450g', 1, 0, 2);

  ins.run(1, 'Pizza Quattro Formaggi', 'Пицца Четыре сыра', 'pizza-quattro-formaggi',
    'Mozzarella, gorgonzola, parmezan, ricotta',
    'Моцарелла, горгонзола, пармезан, рикотта',
    150, null, '/img/menu/pizza-3.jpg', '420g', 1, 0, 3);

  ins.run(1, 'Pizza Prosciutto e Rucola', 'Пицца Прошутто с руколой', 'pizza-prosciutto-rucola',
    'Sos de roșii, mozzarella, prosciutto crudo, rucola, parmezan',
    'Томатный соус, моцарелла, прошутто крудо, руккола, пармезан',
    160, null, '/img/menu/pizza-1.jpg', '450g', 0, 0, 4);

  ins.run(1, 'Pizza Funghi', 'Пицца с грибами', 'pizza-funghi',
    'Sos de roșii, mozzarella, ciuperci champignon, usturoi',
    'Томатный соус, моцарелла, шампиньоны, чеснок',
    130, null, '/img/menu/pizza-2.jpg', '420g', 0, 0, 5);

  ins.run(1, 'Pizza Capricciosa', 'Пицца Каприччоза', 'pizza-capricciosa',
    'Sos de roșii, mozzarella, șuncă, ciuperci, măsline',
    'Томатный соус, моцарелла, ветчина, грибы, оливки',
    145, null, '/img/menu/pizza-3.jpg', '450g', 0, 0, 6);

  ins.run(1, 'Pizza Diavola', 'Пицца Дьявола', 'pizza-diavola',
    'Sos de roșii, mozzarella, salam picant, ardei iute',
    'Томатный соус, моцарелла, острая салями, перец чили',
    140, null, '/img/menu/pizza-1.jpg', '430g', 0, 1, 7);

  ins.run(1, 'Pizza Tonno', 'Пицца с тунцом', 'pizza-tonno',
    'Sos de roșii, mozzarella, ton, ceapă roșie, capere',
    'Томатный соус, моцарелла, тунец, красный лук, каперсы',
    155, null, '/img/menu/pizza-2.jpg', '440g', 0, 0, 8);

  ins.run(1, 'Pizza Calzone', 'Пицца Кальцоне', 'pizza-calzone',
    'Aluat umplut cu ricotta, mozzarella, șuncă, ciuperci',
    'Тесто с начинкой из рикотты, моцареллы, ветчины, грибов',
    150, null, '/img/menu/pizza-3.jpg', '400g', 0, 0, 9);

  ins.run(1, 'Pizza Hawaiana', 'Пицца Гавайская', 'pizza-hawaiana',
    'Sos de roșii, mozzarella, șuncă, ananas',
    'Томатный соус, моцарелла, ветчина, ананас',
    135, null, '/img/menu/pizza-1.jpg', '430g', 0, 0, 10);

  ins.run(1, 'Pizza Vegetariana', 'Пицца Вегетарианская', 'pizza-vegetariana',
    'Sos de roșii, mozzarella, ardei, vinete, dovlecei, roșii',
    'Томатный соус, моцарелла, перец, баклажаны, кабачки, томаты',
    130, null, '/img/menu/pizza-2.jpg', '440g', 0, 0, 11);

  ins.run(1, 'Pizza Salami', 'Пицца Салями', 'pizza-salami',
    'Sos de roșii, mozzarella, salami Milano',
    'Томатный соус, моцарелла, салями Милано',
    140, null, '/img/menu/pizza-3.jpg', '430g', 0, 0, 12);

  ins.run(1, 'Pizza Carbonara', 'Пицца Карбонара', 'pizza-carbonara',
    'Smântână, mozzarella, bacon, ou, parmezan',
    'Сметана, моцарелла, бекон, яйцо, пармезан',
    150, null, '/img/menu/pizza-1.jpg', '440g', 0, 0, 13);

  ins.run(1, 'Pizza Pesto', 'Пицца Песто', 'pizza-pesto',
    'Sos pesto, mozzarella, roșii cherry, parmezan',
    'Соус песто, моцарелла, черри-томаты, пармезан',
    145, null, '/img/menu/pizza-2.jpg', '420g', 0, 1, 14);

  ins.run(1, 'Pizza Renome', 'Пицца Реноме', 'pizza-renome',
    'Sos de roșii, mozzarella, prosciutto, gorgonzola, rucola, roșii cherry',
    'Томатный соус, моцарелла, прошутто, горгонзола, руккола, черри-томаты',
    170, null, '/img/menu/pizza-3.jpg', '480g', 1, 0, 15);

  // ----------------------------------------------------------
  // 2. Paste (category_id = 2) — 12 items
  // ----------------------------------------------------------
  ins.run(2, 'Spaghetti Carbonara', 'Спагетти Карбонара', 'spaghetti-carbonara',
    'Spaghetti cu guanciale, ou, pecorino romano, piper negru',
    'Спагетти с гуанчале, яйцом, пекорино романо, чёрным перцем',
    110, null, '/img/menu/pasta-1.jpg', '350g', 1, 0, 1);

  ins.run(2, 'Spaghetti Bolognese', 'Спагетти Болоньезе', 'spaghetti-bolognese',
    'Spaghetti cu ragù de vită, roșii, parmezan',
    'Спагетти с мясным рагу из говядины, томатами, пармезаном',
    105, null, '/img/menu/pasta-2.jpg', '370g', 1, 0, 2);

  ins.run(2, 'Penne Arrabiata', 'Пенне Арабьята', 'penne-arrabiata',
    'Penne cu sos de roșii picant, usturoi, ardei iute',
    'Пенне с острым томатным соусом, чесноком, перцем чили',
    90, null, '/img/menu/pasta-1.jpg', '340g', 0, 0, 3);

  ins.run(2, 'Fettuccine Alfredo', 'Феттучини Альфредо', 'fettuccine-alfredo',
    'Fettuccine cu sos cremos de unt, parmezan, smântână',
    'Феттучини со сливочным соусом из масла, пармезана и сливок',
    115, null, '/img/menu/pasta-2.jpg', '350g', 0, 0, 4);

  ins.run(2, 'Linguine ai Frutti di Mare', 'Лингвини с морепродуктами', 'linguine-frutti-mare',
    'Linguine cu creveți, midii, calamari, sos de roșii, vin alb',
    'Лингвини с креветками, мидиями, кальмарами, томатным соусом, белым вином',
    140, null, '/img/menu/pasta-1.jpg', '380g', 1, 0, 5);

  ins.run(2, 'Tagliatelle ai Funghi Porcini', 'Тальятелле с белыми грибами', 'tagliatelle-funghi-porcini',
    'Tagliatelle cu ciuperci porcini, smântână, parmezan, trufe',
    'Тальятелле с белыми грибами, сливками, пармезаном, трюфелями',
    135, null, '/img/menu/pasta-2.jpg', '350g', 0, 1, 6);

  ins.run(2, 'Lasagna Classica', 'Лазанья Классическая', 'lasagna-classica',
    'Straturi de paste, ragù de vită, béchamel, mozzarella, parmezan',
    'Слои пасты, мясное рагу из говядины, бешамель, моцарелла, пармезан',
    120, null, '/img/menu/pasta-1.jpg', '400g', 1, 0, 7);

  ins.run(2, 'Ravioli Ricotta e Spinaci', 'Равиоли с рикоттой и шпинатом', 'ravioli-ricotta-spinaci',
    'Ravioli umpluți cu ricotta și spanac, sos de unt și salvie',
    'Равиоли с начинкой из рикотты и шпината, соус из масла и шалфея',
    125, null, '/img/menu/pasta-2.jpg', '320g', 0, 0, 8);

  ins.run(2, 'Penne al Pesto', 'Пенне с соусом Песто', 'penne-pesto',
    'Penne cu sos pesto din busuioc, pin, parmezan, usturoi',
    'Пенне с соусом песто из базилика, кедровых орехов, пармезана, чеснока',
    100, null, '/img/menu/pasta-1.jpg', '340g', 0, 0, 9);

  ins.run(2, 'Gnocchi alla Sorrentina', 'Ньокки по-сорентийски', 'gnocchi-sorrentina',
    'Gnocchi de cartofi cu sos de roșii, mozzarella, busuioc',
    'Картофельные ньокки с томатным соусом, моцареллой, базиликом',
    110, null, '/img/menu/pasta-2.jpg', '350g', 0, 1, 10);

  ins.run(2, 'Spaghetti Aglio e Olio', 'Спагетти Алио э Олио', 'spaghetti-aglio-olio',
    'Spaghetti cu usturoi prăjit, ulei de măsline, ardei iute, pătrunjel',
    'Спагетти с жареным чесноком, оливковым маслом, перцем чили, петрушкой',
    90, null, '/img/menu/pasta-1.jpg', '300g', 0, 0, 11);

  ins.run(2, 'Pappardelle al Ragù', 'Паппарделле с рагу', 'pappardelle-ragu',
    'Pappardelle late cu ragù de vită gătit lent, parmezan',
    'Широкие паппарделле с мясным рагу медленного приготовления, пармезаном',
    125, null, '/img/menu/pasta-2.jpg', '370g', 0, 0, 12);

  // ----------------------------------------------------------
  // 3. Risotto (category_id = 3) — 6 items
  // ----------------------------------------------------------
  ins.run(3, 'Risotto ai Funghi', 'Ризотто с грибами', 'risotto-funghi',
    'Risotto cu ciuperci porcini și champignon, parmezan, unt',
    'Ризотто с белыми грибами и шампиньонами, пармезаном, сливочным маслом',
    120, null, '/img/menu/risotto-1.jpg', '320g', 1, 0, 1);

  ins.run(3, 'Risotto ai Frutti di Mare', 'Ризотто с морепродуктами', 'risotto-frutti-mare',
    'Risotto cu creveți, midii, calamari, vin alb, șofran',
    'Ризотто с креветками, мидиями, кальмарами, белым вином, шафраном',
    160, null, '/img/menu/risotto-2.jpg', '350g', 1, 0, 2);

  ins.run(3, 'Risotto alla Milanese', 'Ризотто по-милански', 'risotto-milanese',
    'Risotto clasic cu șofran, unt, parmezan, vin alb',
    'Классическое ризотто с шафраном, сливочным маслом, пармезаном, белым вином',
    110, null, '/img/menu/risotto-1.jpg', '300g', 0, 0, 3);

  ins.run(3, 'Risotto al Parmigiano', 'Ризотто с пармезаном', 'risotto-parmigiano',
    'Risotto cremos cu parmezan maturat, unt, piper negru',
    'Нежное ризотто с выдержанным пармезаном, сливочным маслом, чёрным перцем',
    115, null, '/img/menu/risotto-2.jpg', '300g', 0, 0, 4);

  ins.run(3, 'Risotto ai Gamberi', 'Ризотто с креветками', 'risotto-gamberi',
    'Risotto cu creveți tigru, vin alb, roșii cherry, busuioc',
    'Ризотто с тигровыми креветками, белым вином, черри-томатами, базиликом',
    150, null, '/img/menu/risotto-1.jpg', '330g', 0, 1, 5);

  ins.run(3, 'Risotto alle Verdure', 'Ризотто с овощами', 'risotto-verdure',
    'Risotto cu dovlecei, sparanghel, mazăre, menta, parmezan',
    'Ризотто с кабачками, спаржей, зелёным горошком, мятой, пармезаном',
    110, null, '/img/menu/risotto-2.jpg', '320g', 0, 0, 6);

  // ----------------------------------------------------------
  // 4. Antipasti (category_id = 4) — 10 items
  // ----------------------------------------------------------
  ins.run(4, 'Bruschetta Classica', 'Брускетта Классическая', 'bruschetta-classica',
    'Pâine prăjită cu roșii proaspete, busuioc, usturoi, ulei de măsline',
    'Поджаренный хлеб со свежими томатами, базиликом, чесноком, оливковым маслом',
    65, null, '/img/menu/antipasti-1.jpg', '200g', 1, 0, 1);

  ins.run(4, 'Carpaccio di Manzo', 'Карпаччо из говядины', 'carpaccio-manzo',
    'Felii subțiri de vită crudă, rucola, parmezan, capere, sos de lămâie',
    'Тонкие ломтики сырой говядины, руккола, пармезан, каперсы, лимонный соус',
    150, null, '/img/menu/antipasti-2.jpg', '180g', 1, 0, 2);

  ins.run(4, 'Caprese', 'Капрезе', 'caprese',
    'Mozzarella di bufala, roșii proaspete, busuioc, ulei de măsline extra virgin',
    'Моцарелла ди буфала, свежие томаты, базилик, оливковое масло экстра вирджин',
    95, null, '/img/menu/antipasti-1.jpg', '250g', 1, 0, 3);

  ins.run(4, 'Antipasto Misto', 'Антипасто Мисто', 'antipasto-misto',
    'Selecție de mezeluri italiene, brânzeturi, măsline, roșii uscate, grissini',
    'Ассорти итальянских мясных деликатесов, сыров, оливок, вяленых томатов, гриссини',
    180, null, '/img/menu/antipasti-2.jpg', '350g', 0, 0, 4);

  ins.run(4, 'Crostini al Prosciutto', 'Кростини с прошутто', 'crostini-prosciutto',
    'Pâine crocantă cu prosciutto crudo, brânză de capră, miere, nuci',
    'Хрустящий хлеб с прошутто крудо, козьим сыром, мёдом, орехами',
    85, null, '/img/menu/antipasti-1.jpg', '180g', 0, 0, 5);

  ins.run(4, 'Arancini', 'Аранчини', 'arancini',
    'Bile de risotto prăjite, umplute cu mozzarella și ragù, sos de roșii',
    'Обжаренные шарики из ризотто с начинкой из моцареллы и рагу, томатный соус',
    80, null, '/img/menu/antipasti-2.jpg', '250g', 0, 1, 6);

  ins.run(4, 'Burrata con Prosciutto', 'Буррата с прошутто', 'burrata-prosciutto',
    'Burrata proaspătă cu prosciutto crudo, roșii cherry, busuioc, balsamic',
    'Свежая буррата с прошутто крудо, черри-томатами, базиликом, бальзамиком',
    160, null, '/img/menu/antipasti-1.jpg', '220g', 0, 1, 7);

  ins.run(4, 'Tartare di Salmone', 'Тартар из лосося', 'tartare-salmone',
    'Somon proaspăt tăiat mărunt, avocado, capere, sos citric, crutoane',
    'Свежий рубленый лосось, авокадо, каперсы, цитрусовый соус, крутоны',
    145, null, '/img/menu/antipasti-2.jpg', '200g', 0, 0, 8);

  ins.run(4, 'Vitello Tonnato', 'Вителло Тоннато', 'vitello-tonnato',
    'Felii de vițel fiert, sos cremos de ton, capere, lămâie',
    'Ломтики отварной телятины, сливочный соус из тунца, каперсы, лимон',
    140, null, '/img/menu/antipasti-1.jpg', '200g', 0, 0, 9);

  ins.run(4, 'Bruschetta ai Pomodori', 'Брускетта с томатами', 'bruschetta-pomodori',
    'Pâine prăjită cu roșii uscate, ricotta, busuioc, balsamic',
    'Поджаренный хлеб с вялеными томатами, рикоттой, базиликом, бальзамиком',
    70, null, '/img/menu/antipasti-2.jpg', '190g', 0, 0, 10);

  // ----------------------------------------------------------
  // 5. Insalate (category_id = 5) — 8 items
  // ----------------------------------------------------------
  ins.run(5, 'Insalata Caesar', 'Салат Цезарь', 'insalata-caesar',
    'Salată romană, piept de pui la grătar, crutoane, parmezan, sos Caesar',
    'Салат романо, куриная грудка на гриле, крутоны, пармезан, соус Цезарь',
    95, null, '/img/menu/salad-1.jpg', '280g', 1, 0, 1);

  ins.run(5, 'Caesar con Gamberi', 'Цезарь с креветками', 'caesar-gamberi',
    'Salată romană, creveți tigru la grătar, crutoane, parmezan, sos Caesar',
    'Салат романо, тигровые креветки на гриле, крутоны, пармезан, соус Цезарь',
    130, null, '/img/menu/salad-2.jpg', '290g', 1, 0, 2);

  ins.run(5, 'Insalata Caprese', 'Салат Капрезе', 'insalata-caprese',
    'Roșii proaspete, mozzarella di bufala, busuioc, ulei de măsline, balsamic',
    'Свежие томаты, моцарелла ди буфала, базилик, оливковое масло, бальзамик',
    90, null, '/img/menu/salad-1.jpg', '260g', 0, 0, 3);

  ins.run(5, 'Insalata Mista', 'Салат Миста', 'insalata-mista',
    'Amestec de frunze verzi, roșii cherry, castraveți, morcov, sos balsamic',
    'Микс зелёных листьев, черри-томаты, огурцы, морковь, бальзамический соус',
    75, null, '/img/menu/salad-2.jpg', '250g', 0, 0, 4);

  ins.run(5, 'Insalata di Rucola', 'Салат с руколой', 'insalata-rucola',
    'Rucola, roșii uscate, parmezan, pin, balsamic, ulei de măsline',
    'Руккола, вяленые томаты, пармезан, кедровые орехи, бальзамик, оливковое масло',
    85, null, '/img/menu/salad-1.jpg', '250g', 0, 0, 5);

  ins.run(5, 'Insalata Tonno', 'Салат с тунцом', 'insalata-tonno',
    'Ton, fasole albă, ceapă roșie, roșii, măsline, ou fiert, ulei de măsline',
    'Тунец, белая фасоль, красный лук, томаты, оливки, варёное яйцо, оливковое масло',
    105, null, '/img/menu/salad-2.jpg', '280g', 0, 0, 6);

  ins.run(5, 'Insalata Panzanella', 'Салат Панцанелла', 'insalata-panzanella',
    'Pâine toscană, roșii, castraveți, ceapă roșie, busuioc, balsamic',
    'Тосканский хлеб, томаты, огурцы, красный лук, базилик, бальзамик',
    80, null, '/img/menu/salad-1.jpg', '270g', 0, 1, 7);

  ins.run(5, 'Insalata Primavera', 'Салат Примавера', 'insalata-primavera',
    'Sparanghel, mazăre, fasole verde, rucola, ridichi, sos de lămâie',
    'Спаржа, зелёный горошек, стручковая фасоль, руккола, редис, лимонный соус',
    85, null, '/img/menu/salad-2.jpg', '260g', 0, 1, 8);

  // ----------------------------------------------------------
  // 6. Supe (category_id = 6) — 5 items
  // ----------------------------------------------------------
  ins.run(6, 'Minestrone', 'Минестроне', 'minestrone',
    'Supă tradițională italiană cu legume de sezon, fasole, paste, busuioc',
    'Традиционный итальянский суп с сезонными овощами, фасолью, пастой, базиликом',
    65, null, '/img/menu/soup-1.jpg', '350g', 1, 0, 1);

  ins.run(6, 'Crema di Zucca', 'Крем-суп из тыквы', 'crema-zucca',
    'Supă cremă de dovleac, ghimbir, smântână, semințe de dovleac prăjite',
    'Крем-суп из тыквы, имбиря, сливок, с обжаренными тыквенными семечками',
    70, null, '/img/menu/soup-2.jpg', '300g', 0, 0, 2);

  ins.run(6, 'Zuppa Toscana', 'Тосканский суп', 'zuppa-toscana',
    'Supă toscană cu cârnați italieni, cartofi, kale, smântână',
    'Тосканский суп с итальянскими колбасками, картофелем, капустой кейл, сливками',
    80, null, '/img/menu/soup-1.jpg', '350g', 0, 1, 3);

  ins.run(6, 'Crema di Funghi', 'Крем-суп из грибов', 'crema-funghi',
    'Supă cremă de ciuperci champignon și porcini, smântână, trufe',
    'Крем-суп из шампиньонов и белых грибов, сливок, трюфелей',
    75, null, '/img/menu/soup-2.jpg', '300g', 0, 0, 4);

  ins.run(6, 'Zuppa di Pesce', 'Рыбный суп', 'zuppa-pesce',
    'Supă de pește cu creveți, midii, calamari, roșii, usturoi, vin alb',
    'Рыбный суп с креветками, мидиями, кальмарами, томатами, чесноком, белым вином',
    110, null, '/img/menu/soup-1.jpg', '400g', 0, 0, 5);

  // ----------------------------------------------------------
  // 7. Carne & Pește (category_id = 7) — 10 items
  // ----------------------------------------------------------
  ins.run(7, 'Filetto di Manzo', 'Филе из говядины', 'filetto-manzo',
    'Fileu de vită la grătar, sos de vin roșu, legume grill, cartofi',
    'Филе говядины на гриле, соус из красного вина, овощи гриль, картофель',
    280, null, '/img/menu/meat-1.jpg', '300g', 1, 0, 1);

  ins.run(7, 'Scaloppine al Limone', 'Скалоппине с лимоном', 'scaloppine-limone',
    'Escalop de vițel în sos de lămâie, capere, unt, cartofi',
    'Эскалоп из телятины в лимонном соусе, каперсы, масло, картофель',
    200, null, '/img/menu/meat-2.jpg', '280g', 0, 0, 2);

  ins.run(7, 'Ossobuco alla Milanese', 'Оссобуко по-милански', 'ossobuco-milanese',
    'Fluier de vițel gătit lent, gremolata, risotto alla milanese',
    'Телячья голяшка медленного приготовления, гремолата, ризотто по-милански',
    250, null, '/img/menu/meat-1.jpg', '400g', 0, 0, 3);

  ins.run(7, 'Pollo alla Parmigiana', 'Курица Пармиджана', 'pollo-parmigiana',
    'Piept de pui pane, sos de roșii, mozzarella, parmezan, busuioc',
    'Куриная грудка в панировке, томатный соус, моцарелла, пармезан, базилик',
    160, null, '/img/menu/meat-2.jpg', '300g', 1, 0, 4);

  ins.run(7, 'Saltimbocca alla Romana', 'Сальтимбокка по-римски', 'saltimbocca-romana',
    'Escalop de vițel cu prosciutto și salvie, sos de vin alb, cartofi',
    'Эскалоп из телятины с прошутто и шалфеем, соус из белого вина, картофель',
    220, null, '/img/menu/meat-1.jpg', '280g', 0, 1, 5);

  ins.run(7, 'Salmone alla Griglia', 'Лосось на гриле', 'salmone-griglia',
    'Fileu de somon la grătar, sparanghel, sos de lămâie și capere',
    'Филе лосося на гриле, спаржа, соус из лимона и каперсов',
    240, null, '/img/menu/meat-2.jpg', '280g', 1, 0, 6);

  ins.run(7, 'Branzino al Forno', 'Бранзино запечённый', 'branzino-forno',
    'Branzino întreg la cuptor, lămâie, rozmarin, cartofi, roșii cherry',
    'Целый бранзино, запечённый с лимоном, розмарином, картофелем, черри-томатами',
    260, null, '/img/menu/meat-1.jpg', '350g', 0, 0, 7);

  ins.run(7, 'Tagliata di Manzo', 'Тальята из говядины', 'tagliata-manzo',
    'Vită la grătar tăiată felii, rucola, roșii cherry, parmezan, balsamic',
    'Говядина на гриле, нарезанная ломтиками, руккола, черри-томаты, пармезан, бальзамик',
    300, null, '/img/menu/meat-2.jpg', '300g', 0, 0, 8);

  ins.run(7, 'Medaglioni di Vitello', 'Медальоны из телятины', 'medaglioni-vitello',
    'Medalioane de vițel, sos de trufe, piure de cartofi, sparanghel',
    'Медальоны из телятины, трюфельный соус, картофельное пюре, спаржа',
    350, null, '/img/menu/meat-1.jpg', '280g', 0, 1, 9);

  ins.run(7, 'Cotoletta alla Milanese', 'Котлета по-милански', 'cotoletta-milanese',
    'Cotlet de vițel pane pe os, lămâie, rucola, roșii cherry',
    'Телячья отбивная в панировке на кости, лимон, руккола, черри-томаты',
    230, null, '/img/menu/meat-2.jpg', '350g', 0, 0, 10);

  // ----------------------------------------------------------
  // 8. Deserturi (category_id = 8) — 8 items
  // ----------------------------------------------------------
  ins.run(8, 'Tiramisù', 'Тирамису', 'tiramisu',
    'Desert clasic italian cu mascarpone, biscuiți savoiardi, cafea espresso, cacao',
    'Классический итальянский десерт с маскарпоне, печеньем савоярди, эспрессо, какао',
    85, null, '/img/menu/dessert-1.jpg', '180g', 1, 0, 1);

  ins.run(8, 'Panna Cotta', 'Панна Котта', 'panna-cotta',
    'Cremă italiană cu vanilie, sos de fructe de pădure',
    'Итальянский сливочный десерт с ванилью, соус из лесных ягод',
    75, null, '/img/menu/dessert-2.jpg', '170g', 1, 0, 2);

  ins.run(8, 'Cheesecake New York', 'Чизкейк Нью-Йорк', 'cheesecake-new-york',
    'Cheesecake clasic cu cremă de brânză, bază de biscuiți, sos de căpșuni',
    'Классический чизкейк со сливочным сыром, основа из печенья, клубничный соус',
    90, null, '/img/menu/dessert-1.jpg', '200g', 0, 0, 3);

  ins.run(8, 'Cannoli Siciliani', 'Канноли Сицилийские', 'cannoli-siciliani',
    'Tuburi crocante umplute cu ricotta dulce, ciocolată, fistic',
    'Хрустящие трубочки с начинкой из сладкой рикотты, шоколадом, фисташками',
    80, null, '/img/menu/dessert-2.jpg', '150g', 0, 1, 4);

  ins.run(8, 'Torta al Cioccolato', 'Шоколадный торт', 'torta-cioccolato',
    'Tort de ciocolată neagră cu nucleu lichid, înghețată de vanilie',
    'Торт из тёмного шоколада с жидким центром, ванильное мороженое',
    95, null, '/img/menu/dessert-1.jpg', '200g', 0, 0, 5);

  ins.run(8, 'Affogato al Caffè', 'Аффогато с кофе', 'affogato-caffe',
    'Înghețată de vanilie turnată cu espresso fierbinte, biscotti',
    'Ванильное мороженое, залитое горячим эспрессо, бискотти',
    60, null, '/img/menu/dessert-2.jpg', '150g', 0, 0, 6);

  ins.run(8, 'Crème Brûlée', 'Крем-брюле', 'creme-brulee',
    'Cremă de vanilie cu crustă caramelizată, fructe proaspete',
    'Ванильный крем с карамелизированной корочкой, свежие фрукты',
    80, null, '/img/menu/dessert-1.jpg', '170g', 0, 0, 7);

  ins.run(8, 'Semifreddo ai Frutti di Bosco', 'Семифреддо с лесными ягодами', 'semifreddo-frutti-bosco',
    'Semifreddo cremos cu fructe de pădure, sos de zmeură',
    'Нежное семифреддо с лесными ягодами, малиновый соус',
    120, null, '/img/menu/dessert-2.jpg', '200g', 0, 1, 8);

  // ----------------------------------------------------------
  // 9. Băuturi (category_id = 9) — 12 items
  // ----------------------------------------------------------
  ins.run(9, 'Espresso', 'Эспрессо', 'espresso',
    'Cafea espresso clasică italiană, prăjire medie',
    'Классический итальянский эспрессо, средняя обжарка',
    25, null, '/img/menu/coffee-1.jpg', '30ml', 1, 0, 1);

  ins.run(9, 'Americano', 'Американо', 'americano',
    'Espresso dublu cu apă fierbinte',
    'Двойной эспрессо с горячей водой',
    30, null, '/img/menu/coffee-2.jpg', '200ml', 0, 0, 2);

  ins.run(9, 'Cappuccino', 'Капучино', 'cappuccino',
    'Espresso, lapte spumat, spumă de lapte cremosă',
    'Эспрессо, вспененное молоко, нежная молочная пенка',
    35, null, '/img/menu/coffee-1.jpg', '250ml', 1, 0, 3);

  ins.run(9, 'Latte', 'Латте', 'latte',
    'Espresso cu lapte cald și strat subțire de spumă',
    'Эспрессо с тёплым молоком и тонким слоем пенки',
    40, null, '/img/menu/coffee-2.jpg', '300ml', 0, 0, 4);

  ins.run(9, 'Limonada de Casă', 'Домашний лимонад', 'limonada-casa',
    'Limonadă proaspătă din lămâi, zahăr, mentă, apă minerală',
    'Свежий лимонад из лимонов, сахара, мяты, минеральной воды',
    40, null, '/img/menu/coffee-1.jpg', '400ml', 1, 0, 5);

  ins.run(9, 'Limonada cu Mentă', 'Лимонад с мятой', 'limonada-menta',
    'Limonadă răcoritoare cu mentă proaspătă, lămâie verde, gheață',
    'Освежающий лимонад со свежей мятой, лаймом, льдом',
    45, null, '/img/menu/coffee-2.jpg', '400ml', 0, 0, 6);

  ins.run(9, 'Fresh de Portocale', 'Свежевыжатый апельсиновый сок', 'fresh-portocale',
    'Suc proaspăt stors din portocale',
    'Свежевыжатый сок из апельсинов',
    45, null, '/img/menu/coffee-1.jpg', '300ml', 0, 0, 7);

  ins.run(9, 'Ceai', 'Чай', 'ceai',
    'Selecție de ceaiuri: negru, verde, fructe, plante',
    'Выбор чаёв: чёрный, зелёный, фруктовый, травяной',
    30, null, '/img/menu/coffee-2.jpg', '400ml', 0, 0, 8);

  ins.run(9, 'Coca-Cola', 'Кока-Кола', 'coca-cola',
    'Coca-Cola clasică',
    'Классическая Кока-Кола',
    30, null, '/img/menu/coffee-1.jpg', '330ml', 0, 0, 9);

  ins.run(9, 'Apă Plată / Carbogazoasă', 'Вода негазированная / газированная', 'apa-plata-carbogazoasa',
    'Apă minerală plată sau carbogazoasă',
    'Минеральная вода без газа или газированная',
    25, null, '/img/menu/coffee-2.jpg', '500ml', 0, 0, 10);

  ins.run(9, 'San Pellegrino', 'Сан-Пеллегрино', 'san-pellegrino',
    'Apă minerală italiană carbogazoasă premium',
    'Итальянская газированная минеральная вода премиум-класса',
    50, null, '/img/menu/coffee-1.jpg', '500ml', 0, 0, 11);

  ins.run(9, 'Smoothie de Fructe', 'Фруктовый смузи', 'smoothie-fructe',
    'Smoothie din fructe proaspete de sezon, iaurt, miere',
    'Смузи из свежих сезонных фруктов, йогурта, мёда',
    55, null, '/img/menu/coffee-2.jpg', '350ml', 0, 1, 12);

  // ----------------------------------------------------------
  // 10. Vin & Cocktail (category_id = 10) — 10 items
  // ----------------------------------------------------------
  ins.run(10, 'Aperol Spritz', 'Апероль Шприц', 'aperol-spritz',
    'Aperol, prosecco, apă tonică, felie de portocală',
    'Апероль, просекко, тоник, долька апельсина',
    80, null, '/img/menu/wine-1.jpg', '250ml', 1, 0, 1);

  ins.run(10, 'Negroni', 'Негрони', 'negroni',
    'Gin, Campari, vermut roșu, coajă de portocală',
    'Джин, Кампари, красный вермут, цедра апельсина',
    90, null, '/img/menu/cocktail-1.jpg', '150ml', 1, 0, 2);

  ins.run(10, 'Hugo', 'Хуго', 'hugo-cocktail',
    'Prosecco, sirop de flori de soc, mentă, lămâie verde, apă minerală',
    'Просекко, сироп из цветов бузины, мята, лайм, минеральная вода',
    75, null, '/img/menu/wine-1.jpg', '250ml', 0, 0, 3);

  ins.run(10, 'Bellini', 'Беллини', 'bellini',
    'Prosecco, piure de piersici proaspete',
    'Просекко, пюре из свежих персиков',
    80, null, '/img/menu/cocktail-1.jpg', '200ml', 0, 0, 4);

  ins.run(10, 'Vin Roșu (paharul)', 'Красное вино (бокал)', 'vin-rosu-pahar',
    'Selecție de vinuri roșii din Moldova și Italia, pahar 150ml',
    'Выбор красных вин из Молдовы и Италии, бокал 150мл',
    60, null, '/img/menu/wine-1.jpg', '150ml', 0, 0, 5);

  ins.run(10, 'Vin Alb (paharul)', 'Белое вино (бокал)', 'vin-alb-pahar',
    'Selecție de vinuri albe din Moldova și Italia, pahar 150ml',
    'Выбор белых вин из Молдовы и Италии, бокал 150мл',
    60, null, '/img/menu/cocktail-1.jpg', '150ml', 0, 0, 6);

  ins.run(10, 'Prosecco', 'Просекко', 'prosecco',
    'Prosecco italian DOC, pahar 150ml',
    'Итальянское просекко DOC, бокал 150мл',
    70, null, '/img/menu/wine-1.jpg', '150ml', 0, 0, 7);

  ins.run(10, 'Limoncello', 'Лимончелло', 'limoncello',
    'Lichior italian clasic de lămâie, servit rece',
    'Классический итальянский лимонный ликёр, подаётся охлаждённым',
    50, null, '/img/menu/cocktail-1.jpg', '50ml', 0, 0, 8);

  ins.run(10, 'Espresso Martini', 'Эспрессо Мартини', 'espresso-martini',
    'Vodcă, lichior de cafea, espresso proaspăt, sirop de zahăr',
    'Водка, кофейный ликёр, свежий эспрессо, сахарный сироп',
    95, null, '/img/menu/wine-1.jpg', '180ml', 0, 1, 9);

  ins.run(10, 'Mojito Italiano', 'Мохито Итальяно', 'mojito-italiano',
    'Prosecco, Limoncello, mentă proaspătă, lămâie verde, zahăr brun',
    'Просекко, Лимончелло, свежая мята, лайм, коричневый сахар',
    85, null, '/img/menu/cocktail-1.jpg', '300ml', 0, 1, 10);

});

seedItems();

console.log('Database seeded with Renome menu — 96 items in 10 categories');

} // end if (existingCount === 0)

module.exports = db;
