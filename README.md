# uca_flow_optimisation

Simulación del sistema de colas con priorización.

## Instalación

npm i

# iot_broker

Es un simulador de broquer de mensajes, se pueden configurar min/max mensajes por remesa, tiempo entre remesas, min/max prioridad en los mensajes

## Ejecutar

node ./iot_broker

## Recuperar mensajes del IoT Broker

Invocar el endpoint: http://localhost:3000/iot_broker/getmsg?num=123

- El parámetro num indica cuantos mensajes queremos obtener del broker. Enviará haste este número si hay en la cola.

# classifier

Obtiene mensajes de una cola de mensajes y los distribuye entre varias colas de prioridad, en función de la prioridad que tenga el mensaje (campo priority interno).
Además revisa si hay mensajes expirados dentro de la cola, y si expiran los mueve a una cola espcial.

## Ejecutar

node ./classifier

## Recuperar mensajes del IoT Broker

Invocar el endpoint: http://localhost:3100/classifier/getmsg?num=123&priority=1

- El parámetro num indica cuantos mensajes queremos obtener de una cola en concreto.
- Priority indica la cola de la queremos obtener mensajes, puede ser un número entre 1 y la máxima prioridad, o 0 para obtener de la cola de expirados.