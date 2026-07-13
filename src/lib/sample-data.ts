// ============================================================
// Data contoh — subset dari ekspor Superset asli (Stock on Hand
// + Rack Master) supaya aplikasi bisa langsung diuji tanpa file.
// ============================================================

const SH = [
  "location_id", "fpd.product_id", "product_name", "sku_number", "l1_category_name",
  "rack_storage_name", "length", "width", "height", "rack_name", "zone", "rack_zone",
  "Aisle", "Bay", "Level", "Bin", "product_detail_status_name", "SUM(stock)", "sku_cbm", "occupied_cbm",
];

const S: (string | number)[][] = [
  ["819","5351","Sasa Santan Kelapa Cair","8991188943536","Bahan Masak & Bumbu","Ambient Room (25C - 30C)",6,6,11,"CBT-SRB1-02-11-L1-01","SRB","SRB1","02","11","L1","01","Available","6.91k","0.0063","2.74"],
  ["819","24921","Kantong Sampah Roll Hitam Size S 45x50 cm A Basics","677521","Kebutuhan Dapur","Ambient Room (25C - 30C)",12,4,4,"CBT-SRC1-23-08-L1-02","SRC","SRC1","23","08","L1","02","Available","6.31k","576µ","1.21"],
  ["819","5107","Milk Life Kids Chocolate Susu UHT","8991999110042","Susu & Olahan Susu","Ambient Room (25C - 30C)",5,3,9,"CBT-SRA1-08-16-L4-01","SRA","SRA1","08","16","L4","01","Available","6k","135µ","0.81"],
  ["819","24921","Kantong Sampah Roll Hitam Size S 45x50 cm A Basics","677521","Kebutuhan Dapur","Ambient Room (25C - 30C)",12,4,4,"CBT-SRC1-23-03-L6-01","SRC","SRC1","23","03","L6","01","Available","6k","192µ","1.15"],
  ["819","35450","Supplies - Sticker Non Kitting Vynil Uk. 6 x 5 cm","00900007443001190","Internal Warehouse","Ambient Room (25C - 30C)",10,10,10,"CBT-MZF3-15-03-L3-01","MZF","MZF3","15","03","L3","01","Available","5.18k","0.001","5.18"],
  ["819","43977","Packaging - AC Paper Greaseproof 40 gsm Uk. 12 x 14 cm","00320001430000754","","Ambient Room (25C - 30C)",10,10,1,"CBT-MZE3-17-01-L1-10","MZE","MZE3","17","01","L1","10","Available","5k","100µ","0.5"],
  ["772","11943","Rose Brand Santan Kelapa Cair","8993093665848","Bahan Masak & Bumbu","Ambient Room (25C - 30C)",6,3,11,"STL-SRA1-18-07-L3-C1","SRA","SRA1","18","07","L3","C1","Available","4.93k","198µ","0.9769"],
  ["819","29824","Spons Cuci Piring Awan A Basics","636465","Peralatan Dapur","Ambient Room (25C - 30C)",12,3,7,"CBT-SRC1-23-10-L1-02","SRC","SRC1","23","10","L1","02","Available","4.82k","756µ","1.21"],
  ["160","25185","(Per ML) WIP Astro Kitchen - Espresso Base","320544","Astro Kitchen - Raw Material Dry","Frozen Room (-15C -18C)",1,1,1,"PGS-STG1-BADSTOCK","STG","STG1","BA","ST","CK","","Bad","4.3k","93µ","0.0043"],
  ["819","46277","Milk Life Teens Full Cream Susu UHT","8991999111346","Susu & Olahan Susu","Ambient Room (25C - 30C)",5,4,12,"CBT-SRA1-08-14-L1-02","SRA","SRA1","08","14","L1","02","Available","4.09k","0.0014","0.9823"],
  ["661","43578","Packaging - Plastik PP Printing AF Signature Uk. 25 x 43 cm (50 Mic)","00300001430000731","Internal Warehouse","Ambient Room (25C - 30C)",10,10,1,"CBN-ABB1-01-00-L1-01","ABB","ABB1","01","00","L1","01","Available","3.88k","0.0029","0.3875"],
  ["661","43580","Packaging - Plastik PP Printing AF Signature Uk. 20 x 53 cm (50 Mic)","00300001430000732","Internal Warehouse","Ambient Room (25C - 30C)",10,10,1,"CBN-ABB1-01-00-L1-01","ABB","ABB1","01","00","L1","01","Available","2.3k","0.0024","0.23"],
  ["819","47111","Cimory Zero Sugar Chocolate Almond Susu UHT","8993200670505","Susu & Olahan Susu","Ambient Room (25C - 30C)",5,4,14,"CBT-SRA1-08-09-L1-02","SRA","SRA1","08","09","L1","02","Available","3.73k","560µ","1.04"],
  ["819","1124","Bango Kecap Manis Botol","8990121011073","Bahan Masak & Bumbu","Ambient Room (25C - 30C)",4,4,16,"CBT-SRC1-03-14-L6-02","SRC","SRC1","03","14","L6","02","Available","3.7k","256µ","0.9462"],
  ["160","24120","Dada Ayam Boneless Astro Farm","516313","Ayam & Unggas","Frozen Room (-15C -18C)",17,4.5,12,"PGS-PLB1-01-01-L1-01","PLB","PLB1","01","01","L1","01","Available","3.23k","0.0147","2.97"],
  ["819","877","Indomie Goreng Special Mie Instan","089686010947","Kebutuhan Pokok","Ambient Room (25C - 30C)",16,12,4,"CBT-SRB1-01-16-L1-02","SRB","SRB1","01","16","L1","02","Available","3.36k","0.0046","2.58"],
  ["819","875","Indomie Kuah Soto Mie Mie Instan","089686010343","Kebutuhan Pokok","Ambient Room (25C - 30C)",15,11,3,"CBT-SRA1-13-06-L1-01","SRA","SRA1","13","06","L1","01","Available","3k","0.0025","1.49"],
  ["772","875","Indomie Kuah Soto Mie Mie Instan","089686010343","Kebutuhan Pokok","Ambient Room (25C - 30C)",15,11,3,"STL-SRA1-20-07-L5-C1","SRA","SRA1","20","07","L5","C1","Available","3k","495µ","1.49"],
  ["160","23136","Paha Ayam Boneless Astro Farm","694233","Ayam & Unggas","Frozen Room (-15C -18C)",14,5,17,"PGS-PLA1-01-01-L1-02","PLA","PLA1","01","01","L1","02","Available","2.97k","0.0595","3.54"],
  ["819","1627","Royco Bumbu Kaldu Rasa Ayam","8999999516208","Bahan Masak & Bumbu","Ambient Room (25C - 30C)",13,2,18,"CBT-SRC1-05-16-L4-02","SRC","SRC1","05","16","L4","02","Available","2.88k","468µ","1.35"],
  ["819","473","Hydro Coco Minuman Air Kelapa Original","8992858527308","Minuman","Ambient Room (25C - 30C)",5,5,13,"CBT-SRA1-07-08-L1-02","SRA","SRA1","07","08","L1","02","Available","2.87k","975µ","0.9318"],
  ["796","24120","Dada Ayam Boneless Astro Farm","516313","Ayam & Unggas","Frozen Room (-15C -18C)",17,4.5,12,"SRG-PLA2-01-01-L1-01","PLA","PLA2","01","01","L1","01","Available","2.53k","0.0606","2.32"],
  ["819","31719","Supplies - Thank You Card (Art Paper uk. 6x9 cm)","00900007443001017","Internal Warehouse","N/A",10,10,10,"","","","","","","","Lost","2.5k","0.001","2.5"],
  ["661","3360","Jamur Enoki","280097","Sayur Segar","Chiller (0C - 5C)",22,7.5,3,"Staging-Antrian-Chiller","ing","ing-","nt","ia","-C","il","Available","2.5k","0.3232","1.24"],
  ["661","3360","Jamur Enoki","280097","Sayur Segar","Chiller (0C - 5C)",22,7.5,3,"CBN-STG1-01-00-L1-02","STG","STG1","01","00","L1","02","Available","1.92k","0.0163","0.9524"],
  ["160","25219","(Per Gram) Butterscotch syrup Indesso - AK","758836","Astro Kitchen - Raw Material Dry","Frozen Room (-15C -18C)",1,1,1,"PGS-STG1-BADSTOCK","STG","STG1","BA","ST","CK","","Bad","2.43k","3µ","0.0024"],
  ["772","1354","Sania Minyak Goreng Pouch","8993496001076","Kebutuhan Pokok","Ambient Room (25C - 30C)",22,11,29,"STL-SRA1-23-10-L1-C7","SRA","SRA1","23","10","L1","C7","Available","2.4k","0.1684","16.87"],
  ["772","876","Indomie Kuah Kari Ayam Mie Instan","089686010527","Kebutuhan Pokok","Ambient Room (25C - 30C)",16,4,12,"STL-SRA1-23-06-L1-C3","SRA","SRA1","23","06","L1","C3","Available","2.4k","768µ","1.84"],
  ["772","877","Indomie Goreng Special Mie Instan","089686010947","Kebutuhan Pokok","Ambient Room (25C - 30C)",16,12,4,"STL-SRA1-22-01-L1-C1","SRA","SRA1","22","01","L1","C1","Available","2.4k","768µ","1.84"],
  ["796","3465","Kanzler Chicken Nugget Original","8993200664382","Makanan Beku","Frozen Room (-15C -18C)",21.6,3,24.5,"SRG-PLC2-01-01-L1-01","PLC","PLC2","01","01","L1","01","Available","2.34k","0.2588","3.72"],
  ["819","32606","Neozep Forte Obat Flu dan Batuk Strip","8992112014018","Obat-obatan","Ambient Room (25C - 30C)",7,1,7,"CBT-HRA3-16-04-L5-03","HRA","HRA3","16","04","L5","03","Available","2.45k","49µ","0.1201"],
  ["160","45179","[Per Ml] Malee Coconut Water 1000ML - AC","737476","Astro Kitchen - Raw Material Chilled/frozen","Frozen Room (-15C -18C)",7,6,22,"PGS-STG1-BADSTOCK","STG","STG1","BA","ST","CK","","Bad","1.8k","0.0166","1.67"],
  ["796","3466","Kanzler Crispy Chicken Nugget","8993200664399","Makanan Beku","Frozen Room (-15C -18C)",18.8,6,18,"SRG-PLD1-01-01-L1-01","PLD","PLD1","01","01","L1","01","Available","1.86k","0.002","3.78"],
  ["160","23955","Glico Wings Frostbite Cookies & Cream Mochi","8998866820486","Es Krim","Frozen Room (-15C -18C)",10,3,8.5,"PGS-CFF1-01-33-L1-05","CFF","CFF1","01","33","L1","05","Available","1.54k","255µ","0.3927"],
  ["819","49547","Coca-Cola Zero Minuman Soda Can","8992761111298","Minuman","Ambient Room (25C - 30C)",19,9,24,"CBT-SRA1-02-03-L2-01","SRA","SRA1","02","03","L2","01","Available","1.56k","0.0041","6.4"],
  ["819","2014","Indomie Goreng Special Jumbo Mie Instan","089686041705","Kebutuhan Pokok","Ambient Room (25C - 30C)",12,7,26,"CBT-SRB1-01-14-L1-02","SRB","SRB1","01","14","L1","02","Available","1.76k","0.0197","3.84"],
  ["819","1228","Kispray Glamorous Gold Pelicin Pakaian Refill","8992772198059","Perlengkapan Pakaian","Ambient Room (25C - 30C)",12,6,20,"CBT-SRC1-09-14-L1-01","SRC","SRC1","09","14","L1","01","Available","1.92k","0.0043","2.76"],
  ["819","44332","Grandairy Full Cream Susu UHT","8993319050120","Susu & Olahan Susu","Ambient Room (25C - 30C)",9,6,20,"CBT-SRA1-08-03-L2-02","SRA","SRA1","08","03","L2","02","Available","1.8k","0.0022","1.94"],
  ["772","31292","OREO BTS Biskuit Sandwich dengan Krim Rasa Hotteok Brown Sugar Pancake","7622201704223","Biskuit","Ambient Room (25C - 30C)",20,4,6,"STL-SRA1-20-09-L1-C8","SRA","SRA1","20","09","L1","C8","Available","1.54k","480µ","0.7373"],
  ["819","33858","Mangkok Plastik A Basics 6inch","699919","Perlengkapan Pesta","Ambient Room (25C - 30C)",15,6,15,"CBT-SRC1-13-14-L1-01","SRC","SRC1","13","14","L1","01","Available","1.77k","0.004","2.39"],
  ["819","2563","Frisian Flag Full Cream Susu UHT","8992753033744","Susu & Olahan Susu","Ambient Room (25C - 30C)",4,4,14,"CBT-SRA1-08-14-L1-01","SRA","SRA1","08","14","L1","01","Available","1.72k","224µ","0.3862"],
];

const RH = [
  "location_id", "location_name", "location_latitude", "location_longitude", "id", "position",
  "rack_name", "area", "zone", "aisle", "bay", "level", "bin", "active",
  "max_quantity", "max_volume", "rack_storage_name",
];

const R: (string | number)[][] = [
  ["819","CBT - WH Cibitung","-6.3181805","107.1065821",3217204,115301,"CBT-MZE2-10-02-L3-01","CBT","MZE2","10","02","L3","01","true",1,1,"Ambient Room (25C - 30C)"],
  ["819","CBT - WH Cibitung","-6.3181805","107.1065821",3379394,205501,"CBT-SRA1-14-15-L2-01","CBT","SRA1","14","15","L2","01","true",1,1,"Ambient Room (25C - 30C)"],
  ["819","CBT - WH Cibitung","-6.3181805","107.1065821",3354761,205899,"CBT-SRB1-02-11-L1-01","CBT","SRB1","02","11","L1","01","true",1,1,"Ambient Room (25C - 30C)"],
  ["819","CBT - WH Cibitung","-6.3181805","107.1065821",3421641,500899,"CBT-SRC1-23-08-L1-02","CBT","SRC1","23","08","L1","02","true",1,1,"Ambient Room (25C - 30C)"],
  ["819","CBT - WH Cibitung","-6.3181805","107.1065821",3379401,205511,"CBT-SRA1-08-16-L4-01","CBT","SRA1","08","16","L4","01","true",1,1,"Ambient Room (25C - 30C)"],
  ["819","CBT - WH Cibitung","-6.3181805","107.1065821",3239702,138514,"CBT-MZF3-15-03-L3-01","CBT","MZF3","15","03","L3","01","true",1,1,"Ambient Room (25C - 30C)"],
  ["819","CBT - WH Cibitung","-6.3181805","107.1065821",3221520,107926,"CBT-MZE3-17-01-L1-10","CBT","MZE3","17","01","L1","10","true",1,1,"Ambient Room (25C - 30C)"],
  ["819","CBT - WH Cibitung","-6.3181805","107.1065821",3378040,203724,"CBT-SRA1-02-03-L2-01","CBT","SRA1","02","03","L2","01","true",1,1,"Ambient Room (25C - 30C)"],
  ["819","CBT - WH Cibitung","-6.3181805","107.1065821",2828475,7945,"CBT-HRA3-16-04-L5-03","CBT","HRA3","16","04","L5","03","true",1,1,"Ambient Room (25C - 30C)"],
  ["819","CBT - WH Cibitung","-6.3181805","107.1065821",3421462,500751,"CBT-SRC1-08-15-L2-02","CBT","SRC1","08","15","L2","02","true",1,1,"Ambient Room (25C - 30C)"],
  ["819","CBT - WH Cibitung","-6.3181805","107.1065821",3421803,501050,"CBT-SRC1-15-04-L3-01","CBT","SRC1","15","04","L3","01","true",1,1,"WH Dry - SPR"],
  ["772","STL - Warehouse Sentul","-6.5154110","106.8564770",2353664,143985,"STL-SRA1-30-12-L4-C1","STL","SRA1","30","12","L4","C1","true",1,1,"Ambient Room (25C - 30C)"],
  ["772","STL - Warehouse Sentul","-6.5154110","106.8564770",2353701,143990,"STL-SRA1-23-10-L1-C7","STL","SRA1","23","10","L1","C7","true",1,1,"Ambient Room (25C - 30C)"],
  ["772","STL - Warehouse Sentul","-6.5154110","106.8564770",2353702,143991,"STL-SRA1-18-07-L3-C1","STL","SRA1","18","07","L3","C1","true",1,1,"Ambient Room (25C - 30C)"],
  ["772","STL - Warehouse Sentul","-6.5154110","106.8564770",2431755,115577,"STL-MZA2-14-02-L4-06","STL","MZA2","14","02","L4","06","true",1,1,"Ambient Room (25C - 30C)"],
  ["160","PGS - Pegangsaan","-6.1468128","106.9146491",1665388,93355,"PGS-CHD1-08-15-L1-03","PGS","CHD1","08","15","L1","03","true",200,100,"Frozen Room (-15C -18C)"],
  ["160","PGS - Pegangsaan","-6.1468128","106.9146491",1665401,93360,"PGS-PLB1-01-01-L1-01","PGS","PLB1","01","01","L1","01","true",200,100,"Frozen Room (-15C -18C)"],
  ["160","PGS - Pegangsaan","-6.1468128","106.9146491",1665402,93361,"PGS-PLA1-01-01-L1-02","PGS","PLA1","01","01","L1","02","true",200,100,"Frozen Room (-15C -18C)"],
  ["160","PGS - Pegangsaan","-6.1468128","106.9146491",1665410,93370,"PGS-CFF1-01-33-L1-05","PGS","CFF1","01","33","L1","05","true",200,100,"Frozen Room (-15C -18C)"],
  ["160","PGS - Pegangsaan","-6.1468128","106.9146491",1729489,92931,"PGS-CHG1-01-07-L5-04","PGS","CHG1","01","07","L5","04","true",200,100,"Chiller (0C - 5C)"],
  ["160","PGS - Pegangsaan","-6.1468128","106.9146491",1728804,89208,"PGS-ABB1-02-11-L2-04","PGS","ABB1","02","11","L2","04","true",200,100,"Ambient Room (25C - 30C)"],
  ["796","SRG - WH Srengseng","-6.2013185","106.7557813",3027755,203008,"SRG-GDF1-02-01-L3-15","SRG","GDF1","02","01","L3","15","true",200,1,"Chiller (0C - 5C)"],
  ["796","SRG - WH Srengseng","-6.2013185","106.7557813",3016495,201362,"SRG-GDC1-02-01-L1-30","SRG","GDC1","02","01","L1","30","true",200,1,"Frozen Room (-15C -18C)"],
  ["796","SRG - WH Srengseng","-6.2013185","106.7557813",3016501,201370,"SRG-PLA2-01-01-L1-01","SRG","PLA2","01","01","L1","01","true",200,1,"Frozen Room (-15C -18C)"],
  ["796","SRG - WH Srengseng","-6.2013185","106.7557813",3016502,201371,"SRG-PLC2-01-01-L1-01","SRG","PLC2","01","01","L1","01","true",200,1,"Frozen Room (-15C -18C)"],
  ["796","SRG - WH Srengseng","-6.2013185","106.7557813",3016503,201372,"SRG-PLD1-01-01-L1-01","SRG","PLD1","01","01","L1","01","true",200,1,"Frozen Room (-15C -18C)"],
  ["661","CBN - WH Cibinong","-6.5077590","106.8370150",3420792,831,"CBN-ABA1-02-01-L2-04","CBN","ABA1","02","01","L2","04","true",100,2,"Ambient Room (25C - 30C)"],
  ["661","CBN - WH Cibinong","-6.5077590","106.8370150",3420800,835,"CBN-ABB1-01-00-L1-01","CBN","ABB1","01","00","L1","01","true",100,2,"Ambient Room (25C - 30C)"],
  ["661","CBN - WH Cibinong","-6.5077590","106.8370150",3557786,616,"CBN-CHA2-02-03-L2-01","CBN","CHA2","02","03","L2","01","true",20,2,"Chiller (0C - 5C)"],
  ["661","CBN - WH Cibinong","-6.5077590","106.8370150",3557790,620,"CBN-STG1-01-00-L1-02","CBN","STG1","01","00","L1","02","true",20,2,"Chiller (0C - 5C)"],
  ["912","WH Sunter Overflow","-6.1346590","106.8774800",3662767,643,"STR-CHC1-01-18-L1-04","STR","CHC1","01","18","L1","04","true",200,100,"Chiller (0C - 5C)"],
  ["860","BGO - WH Bogor","-6.5405370","106.8078580",3610525,4558,"BGO-CHA1-04-44-L2-04","BGO","CHA1","04","44","L2","04","true",20,2,"Chiller (0C - 5C)"],
  ["860","BGO - WH Bogor","-6.5405370","106.8078580",3555217,3104,"BGO-CRA1-01-03-L2-06","BGO","CRA1","01","03","L2","06","true",20,2,"Cool Room (15C - 20C)"],
  ["983","BIT - WH Bitung","-6.2538650","106.5545120",3656935,21301,"BIT-CHA1-10-05-L1-02","BIT","CHA1","10","05","L1","02","true",40,1,"Frozen Room (-15C -18C)"],
];

const toTsv = (h: string[], rows: (string | number)[][]) =>
  [h.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");

export const SAMPLE_STOCK_TSV = toTsv(SH, S);
export const SAMPLE_RACK_TSV = toTsv(RH, R);
