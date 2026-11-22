import json
import os
import urllib.request
import urllib.error
from flask import Flask, render_template, jsonify

app = Flask(__name__)

# Server-side API key configuration (kept safely on server, never exposed to client)
POKEAPI_KEY = os.environ.get("POKEAPI_KEY", "")

def fetch_from_pokeapi(path):
    headers = {
        "User-Agent": "MalihaFarhan-FlaskHolocron/1.0"
    }
    if POKEAPI_KEY:
        headers["Authorization"] = f"Bearer {POKEAPI_KEY}"
        headers["X-Api-Key"] = POKEAPI_KEY

    full_url = f"https://pokeapi.co/api/v2/{path}"
    req = urllib.request.Request(full_url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8")), 200
    except urllib.error.HTTPError as e:
        return {"error": f"Upstream API error: {e.code}"}, e.code
    except Exception as e:
        return {"error": str(e)}, 500

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/game")
def game():
    return render_template("game.html")

@app.route("/portfolio")
def portfolio():
    return render_template("portfolio.html")

@app.route("/api")
def api_holocron():
    return render_template("pokedex.html")

@app.route("/api/pokemon/<id_or_name>")
def proxy_pokemon(id_or_name):
    data, status = fetch_from_pokeapi(f"pokemon/{id_or_name.lower()}")
    return jsonify(data), status

@app.route("/api/habitat/<name>")
def proxy_habitat(name):
    data, status = fetch_from_pokeapi(f"pokemon-habitat/{name.lower()}")
    return jsonify(data), status

@app.errorhandler(404)
def page_not_found(e):
    return render_template("404.html"), 404

if __name__ == "__main__":
    app.run(debug=True, port=5000)
