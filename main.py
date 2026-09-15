from machine import Pin
import time
import network
from umqtt.simple import MQTTClient

# ============================================================
# RED Y MQTT
# ============================================================
WIFI_SSID = "Wokwi-GUEST"
WIFI_PASS = ""
MQTT_BROKER = "broker.hivemq.com"

# IMPORTANTE: este identificador/topic debe ser diferente al
# de los demás grupos. Se usa "salomon_esquiaqui".
GRUPO = "salomon_esquiaqui"
TOPIC_ENVIAR = "clase/decoder/{}/estado".format(GRUPO)
TOPIC_RECIBIR = "clase/decoder/{}/control".format(GRUPO)
TOPIC_STATUS = "clase/decoder/salomon_esquiaqui/status"
# ============================================================
# DIP SWITCH: S1 S2 S3 S4
# S1 = MSB (8), S4 = LSB (1)
# ============================================================
b0 = Pin(27, Pin.IN, Pin.PULL_DOWN)
b1 = Pin(26, Pin.IN, Pin.PULL_DOWN)
b2 = Pin(25, Pin.IN, Pin.PULL_DOWN)
b3 = Pin(33, Pin.IN, Pin.PULL_DOWN)

pines_dip = [b0, b1, b2, b3]

# ============================================================
# DISPLAY 7 SEGMENTOS - ANODO COMUN
# 0 = segmento encendido, 1 = segmento apagado
# Orden: A B C D E F G
# ============================================================
A = Pin(23, Pin.OUT)
B = Pin(22, Pin.OUT)
C = Pin(16, Pin.OUT)
D = Pin(17, Pin.OUT)
E = Pin(18, Pin.OUT)
F = Pin(21, Pin.OUT)
G = Pin(19, Pin.OUT)

segmentos = [A, B, C, D, E, F, G]

display = {
    0: [0, 0, 0, 0, 0, 0, 1],
    1: [1, 0, 0, 1, 1, 1, 1],
    2: [0, 0, 1, 0, 0, 1, 0],
    3: [0, 0, 0, 0, 1, 1, 0],
    4: [1, 0, 0, 1, 1, 0, 0],
    5: [0, 1, 0, 0, 1, 0, 0],
    6: [0, 1, 0, 0, 0, 0, 0],
    7: [0, 0, 0, 1, 1, 1, 1],
    8: [0, 0, 0, 0, 0, 0, 0],
    9: [0, 0, 0, 0, 1, 0, 0],
}

APAGADO = [1, 1, 1, 1, 1, 1, 1]


def mostrar(numero):
    """Muestra 0-9 en el display físico."""
    patron = display.get(numero, APAGADO)

    for pin, estado in zip(segmentos, patron):
        pin.value(estado)


def leer_dip():
    """Lee S1..S4 como un patrón binario MSB -> LSB."""
    valor_b0 = b0.value()
    valor_b1 = b1.value()
    valor_b2 = b2.value()
    valor_b3 = b3.value()

    numero = (
        valor_b0 * 8 +
        valor_b1 * 4 +
        valor_b2 * 2 +
        valor_b3 * 1
    )

    return valor_b0, valor_b1, valor_b2, valor_b3, numero


# ============================================================
# WIFI
# ============================================================
def conectar_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)

    if wlan.isconnected():
        print("WiFi ya conectado. IP:", wlan.ifconfig()[0])
        return wlan

    print("Conectando a WiFi...")
    wlan.connect(WIFI_SSID, WIFI_PASS)

    inicio = time.ticks_ms()

    while not wlan.isconnected():
        if time.ticks_diff(time.ticks_ms(), inicio) > 10000:
            raise OSError("WiFi timeout - verifique Wokwi-GUEST")
        time.sleep_ms(300)

    print("WiFi OK - IP:", wlan.ifconfig()[0])
    return wlan

    print("WiFi OK - IP:", wlan.ifconfig()[0])
    return wlan


    print("WiFi OK - IP:", wlan.ifconfig()[0])
    return wlan


# ============================================================
# HEARTBEAT / ESTADO DE CONEXIÓN
# ============================================================
HEARTBEAT_INTERVAL = 3
ultimo_heartbeat = 0


# ============================================================
# MQTT: FRONTEND -> ESP32
# ============================================================
def al_recibir_del_frontend(topic, msg):
    try:
        numero_remoto = int(msg.decode().strip())

        if 0 <= numero_remoto <= 9:
            mostrar(numero_remoto)
            print("Comando remoto recibido:", numero_remoto)
        else:
            print("Valor fuera de rango:", numero_remoto)

    except ValueError:
        print("Mensaje no numérico recibido:", msg)


# ============================================================
# INICIO
# ============================================================
print("========================================")
print("   DECODIFICADOR BINARIO ESP32 + MQTT")
print("========================================")
print("Grupo:", GRUPO)
print("Estado:", TOPIC_ENVIAR)
print("Control:", TOPIC_RECIBIR)

mostrar(0)
conectar_wifi()

client_id = "esp32_{}_{}".format(GRUPO, time.ticks_ms())
client = MQTTClient(client_id, MQTT_BROKER)
client.set_callback(al_recibir_del_frontend)

print("Conectando a MQTT...")
client.connect()
client.subscribe(TOPIC_RECIBIR)

# Avisar al frontend que el ESP32 está conectado
client.publish(TOPIC_STATUS, b"online")

print("MQTT listo - escuchando en:", TOPIC_RECIBIR)
print("Estado MQTT:", TOPIC_STATUS)

# ============================================================
# BUCLE PRINCIPAL
# ============================================================
ultimo = -1
ultimo_heartbeat = time.ticks_ms()

while True:
    # Revisar mensajes del frontend sin bloquear.
    client.check_msg()

    # Enviar heartbeat cada 3 segundos
    ahora = time.ticks_ms()

    if time.ticks_diff(ahora, ultimo_heartbeat) >= HEARTBEAT_INTERVAL * 1000:
        client.publish(TOPIC_STATUS, b"online")
        ultimo_heartbeat = ahora
        print("Heartbeat: ESP32 online")

    bit0, bit1, bit2, bit3, numero = leer_dip()

    # Publicar solamente cuando cambia el DIP.
    if numero != ultimo:
        bits_str = "{}{}{}{}".format(bit0, bit1, bit2, bit3)
        payload = "{},{}".format(bits_str, numero)

        client.publish(TOPIC_ENVIAR, payload.encode())

        print(
            "Publicado: {}  |  DIP (S1 S2 S3 S4): {} {} {} {} -> {}"
            .format(payload, bit0, bit1, bit2, bit3, numero)
        )

        # El display físico sigue siendo controlado por el DIP.
        mostrar(numero)
        ultimo = numero

    time.sleep_ms(50)
