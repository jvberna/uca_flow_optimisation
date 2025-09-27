const axios = require('axios');
const ENDPOINT_URL = 'http://localhost:3200/dispatcher/getmsg';
const num = 600; // mensajes que del dispatcher se sirven al sistema
const timeLectura = 1000; // cada segundo

// Función que obtiene mensajes del broker IoT y los devuelve
async function getDisptacherMessage() {

    try {
        // Axios realiza la solicitud GET. Por defecto, ya espera que la respuesta sea JSON.
        const response = await axios.get(ENDPOINT_URL + "?num=" + num , {
            // Puedes añadir headers si el endpoint lo requiere (e.g., para autenticación)
            headers: {
                // 'Authorization': 'Bearer TU_TOKEN' 
            },
            // Opciones de configuración adicionales
            timeout: 5000 // Tiempo de espera de 5 segundos
        });
        console.log("Leidos ", response.data.numMsg, " mensajes del dispatcher");
        //return response.data;


    } catch (error) {
        // Axios lanza un error si la solicitud falla (problemas de red) o si
        // el servidor responde con un código 4xx o 5xx.

        if (error.response) {
            // El servidor respondió con un código de estado fuera del rango 2xx
            console.error(`\nError del servidor (${error.response.status}):`);
            console.error(error.response.data);
        } else if (error.request) {
            // La solicitud fue enviada, pero no se recibió respuesta (ej. timeout, servidor caído)
            console.error("\nNo se recibió respuesta del servidor.");
        } else {
            // Error de configuración o algo pasó antes de enviar la solicitud
            console.error("\nError al configurar la solicitud:", error.message);
        }
        return null;
    }

}

setInterval(getDisptacherMessage,timeLectura); 