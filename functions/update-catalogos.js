const fs = require('fs');
const admin = require('firebase-admin');
const app = admin.initializeApp({projectId:'ventas-online-ec'});
const db = admin.firestore(app);
const d = JSON.parse(fs.readFileSync('scripts/data/productos-nuevos-procesados.json','utf8'));
const productos = d.productos;

let actualizados = 0;
let fallidos = 0;

// Actualizar en lotes de 50
for (let loteInicial = 0; loteInicial < productos.length; loteInicial += 50) {
    const lote = productos.slice(loteInicial, loteInicial + 50);
    const promesas = lote.map(p => {
        return new Promise((resolve, reject) => {
            db.doc('products/' + p.doc.sku).update({catalogIds: [p.doc.catalogIds[0]]})
                .then(() => { actualizados++; resolve(); })
                .catch((e) => { fallidos++; console.log('Error:', p.doc.sku, e.message.substring(0,40)); resolve(); });
        });
    });
    Promise.all(promesas).then(() => {
        console.log('Lote ' + (loteInicial/50 + 1) + ': actualizados=' + actualizados + ', fallidos=' + fallidos);
    });
}
console.log('Total procesado: ' + productos.length);
console.log('Actualizados final: ' + actualizados + ', Fallidos: ' + fallidos);