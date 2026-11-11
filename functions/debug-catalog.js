const admin = require('firebase-admin');
const app = admin.initializeApp({projectId:'ventas-online-ec'});
const db = admin.firestore(app);
db.collection('products').get().then(snap => {
  snap.forEach(doc => {
    const d = doc.data();
    const name = d.name || '';
    const upper = name.toUpperCase();
    const isEstuche = upper.includes('ESTUCHE') || upper.includes('CASE') || upper.includes('SILICON');
    const isVidrio = upper.includes('VIDRIO') || upper.includes('CERAMIC');
    console.log('SKU:', d.sku.substring(0,15), '| Name:', name.substring(0,30), '| Estuche:', isEstuche, '| Vidrio:', isVidrio, '| Catalog:', d.catalogIds[0]);
  });
});