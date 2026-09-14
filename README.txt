# ESP32 Binary Decoder — Wokwi + HTML/CSS/JS + MQTT

## 1. Archivos

- `main.py` → código MicroPython para ESP32/Wokwi.
- `index.html` → interfaz web.
- `style.css` → diseño retro + liquid glass.
- `script.js` → MQTT WebSocket, display virtual y teclado.
- `README.txt` → guía rápida.

## 2. Topic usado

Se escogió un identificador propio:

`salomon_esquiaqui_yilmar_almanza`

Topics:

`clase/decoder/salomon_esquiaqui/estado`

`clase/decoder/salomon_esquiaqui/control`

Si el profesor exige otro identificador de grupo, cámbialo en `main.py` y `script.js`, manteniéndolo exactamente igual en ambos.

## 3. Conexión Wokwi

Conserva las conexiones indicadas:

DIP:
- S1 -> GPIO27
- S2 -> GPIO26
- S3 -> GPIO25
- S4 -> GPIO33
- común -> 3V3

Display:
- A -> GPIO23
- B -> GPIO22
- C -> GPIO16
- D -> GPIO17
- E -> GPIO18
- F -> GPIO21
- G -> GPIO19
- COM -> 5V

## 4. Orden binario

S1 S2 S3 S4 = MSB -> LSB.

Ejemplos:

0000 = 0
0001 = 1
0010 = 2
0011 = 3
0100 = 4
0101 = 5
0110 = 6
0111 = 7
1000 = 8
1001 = 9

Los patrones 1010 a 1111 representan 10 a 15. Son entradas binarias válidas, pero el display numérico solo representa 0-9, por eso la interfaz deja el display virtual apagado para 10-15.

## 5. Ejecutar

1. Abre Wokwi y coloca `main.py` con el código incluido.
2. Ejecuta la simulación.
3. En el monitor serie deben aparecer:
   - `WiFi OK`
   - `MQTT listo`
   - `Publicado: XXXX,D`
4. Abre `index.html` en un navegador moderno.
5. El indicador debe pasar a `Conectado`.
6. Mueve el DIP de Wokwi: la interfaz recibe `bits,decimal`.
7. Pulsa un botón 0-9 de la interfaz: se publica el número al ESP32 y el display físico cambia.

## 6. Importante

La interfaz usa Paho MQTT JavaScript desde CDN y WebSockets seguros de HiveMQ por el puerto 8884. Necesitas conexión a Internet para que el navegador llegue al broker y descargue la librería.

Para una entrega académica, conviene mantener `main.py`, `index.html`, `style.css` y `script.js` en la misma carpeta.
