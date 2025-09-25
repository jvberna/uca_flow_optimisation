/****
 * 
 * iot_broker simula un broker de mensajes IoT, que genera mensajes de forma aleatoria y los almacena en una cola.
 * Cada mensaje tiene una estructura interna con un remesa, id y prioridad.
 * 
 * 
 */


// Creamos un endpoint que atiende '/iot_broker/getmsg?num=1234' solicitando X número de mensajes de la cola
const express = require('express');
const { query, validationResult } = require('express-validator');

const app = express();
const port = 3000;
const rute = '/iot_broker/getmsg';

// Middleware para la ruta GET /iot_broker/getmsg
app.get( 
  rute,
  [
    // Validaciones para los parámetros de la consulta
    query('num')
      .notEmpty()
      .withMessage('num es un campo requerido.')
      .isNumeric()
      .withMessage('num debe ser un numero.')
  ],
  (req, res) => {
    // Manejo de los errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Si la validación es exitosa, procesa la solicitud
    const { num } = req.query;

    
    // desencolo de la cola de mensajes tantos mensajes como dice num
    // extraemos los mensajes del principio de la cola
    const returnMsg = colaMensajes.splice(0, num);
    console.log('Desencolamos ',num,' menajes de la cola. Quedan ',colaMensajes.length,' mensajes en la cola.');
    
    // Respondemos con los mensajes extraídos
    res.status(200).json({
      message: 'Extraer mensajes de la cola',
      data: req.query,
      mensajes: returnMsg
    });
  }
);

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
  // Después de iniciar el servidor, comenzamos a generar mensajes
  crearMensajes();
});

let colaMensajes = [];
let contador = 0;
// Máximo y mínimo mensajes a generar en cada remesa
const maxMensajes = 10;
const minMensajes = 5;
// Tiempo máximo en ms para generar una nueva remesa de mensajes
const maxTimeToGenerateMsg = 1000;
// Prioridades de los mensajes
const maxPriority = 4;  
const minPriority = 1;

// Función para generar una prioridad aleatoria entre min y max (ambos inclusive)
const genPriority = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Función que genera mensajes de forma aleatoria y los añade a la cola
// Los mensajes se encolan al final de la cola
// Cada mensaje tiene la estructura { remesa: X, id: X-Y, priority: Z }
const crearMensajes = () => {
  contador++;
  const newMsg = Math.round((Math.random()*(maxMensajes - minMensajes))) + minMensajes;

  // hacemos push de los mensajes a la cola (encola al final)
  for (let i=0; i<newMsg; i++) {
    colaMensajes.push( 
      { remesa: contador, 
        id: contador+'-'+i , 
        priority : genPriority(minPriority, maxPriority) ,
        timestamp: Date.now()
      } );
  }

  // programamos la siguiente generación de mensajes
  const siguiente = Math.round(Math.random()*maxTimeToGenerateMsg);
  console.log(contador,'.- Genero ',newMsg, ' nuevos mensajes, la cola tiene ',colaMensajes.length,'. Siguiente en ',siguiente, 'ms ');
  setTimeout(crearMensajes, siguiente);
}

