import requests
import re
import json
import os
import sys

URL = "https://www.salute.gov.it/new/it/tema/ondate-di-calore/bollettini-sulle-ondate-di-calore-0/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}
OUTPUT_FILE = "bollettino_ancona.json"

def fetch_page_with_bypass():
    session = requests.Session()
    print("Tentativo di recupero della pagina ministeriale...")
    response = session.get(URL, headers=HEADERS)
    
    html = response.text
    # Controlla se la pagina contiene il blocco di sicurezza di Gcore/ShieldSquare
    if "Please enable cookies" in html or "Please enable JavaScript" in html or "sbtsck" in html:
        print("Rilevata sfida di sicurezza Gcore/ShieldSquare. Tento il bypass...")
        # Cerca il cookie sbtsck nel codice della risposta
        match = re.search(r'document\.cookie="sbtsck=([^;"]+)', html)
        if match:
            sbtsck_value = match.group(1)
            print(f"Cookie di bypass trovato: {sbtsck_value[:20]}...")
            session.cookies.set("sbtsck", sbtsck_value, domain="www.salute.gov.it", path="/")
            
            # Esegui nuovamente la richiesta con il cookie impostato
            response = session.get(URL, headers=HEADERS)
            html = response.text
        else:
            print("Impossibile trovare il cookie di bypass nel codice della risposta.")
            
    return html

def parse_bulletin(html):
    # Estrai le date dall'intestazione <thead> (formato GG-MM-AAAA)
    dates = re.findall(r'<th[^>]*>(\d{2}-\d{2}-\d{4})</th>', html)
    if not dates:
        print("Errore: Impossibile trovare le date di previsione nell'intestazione della tabella.")
        return None
        
    print(f"Date previste individuate: {dates}")

    # Trova la riga corrispondente ad ANCONA (case-insensitive)
    tr_matches = re.findall(r'<tr[^>]*>.*?ANCONA.*?</tr>', html, re.DOTALL | re.IGNORECASE)
    if not tr_matches:
        print("Errore: Impossibile trovare la riga relativa ad ANCONA nella tabella dei bollettini.")
        return None
        
    ancona_tr = tr_matches[0]
    
    # Estrai l'URL del PDF
    pdf_match = re.search(r'href="([^"]+)"', ancona_tr)
    pdf_url = ""
    if pdf_match:
        pdf_url = pdf_match.group(1)
        if not pdf_url.startswith("http"):
            pdf_url = "https://www.salute.gov.it" + pdf_url
    print(f"URL del bollettino PDF: {pdf_url}")
            
    # Estrai i 3 livelli di allerta (classi caldo-circle-livello-X)
    levels = re.findall(r'caldo-circle-livello-([0-3])', ancona_tr)
    if len(levels) < 3:
        print(f"Attenzione: Trovati solo {len(levels)} livelli su 3. Tento di allineare con le date disponibili.")
        
    # Combina date e livelli
    parsed_data = []
    for i, date in enumerate(dates):
        if i < len(levels):
            # Converti data da GG-MM-AAAA a AAAA-MM-GG
            day, month, year = date.split("-")
            iso_date = f"{year}-{month}-{day}"
            
            parsed_data.append({
                "city": "ANCONA",
                "date": iso_date,
                "level": f"Livello{levels[i]}",
                "pdfUrl": pdf_url
            })
            
    return parsed_data

def main():
    try:
        html = fetch_page_with_bypass()
        
        # Verifica veloce se la pagina contiene dati utili prima di fare il parsing
        if "Città" not in html and "citta" not in html.lower():
            print("Errore: La risposta finale non contiene la tabella dei bollettini (ancora bloccata dal WAF).")
            sys.exit(1)
            
        data = parse_bulletin(html)
        if not data or len(data) == 0:
            print("Errore: Il parsing della tabella ha restituito dati vuoti o non validi.")
            sys.exit(1)
            
        # Salva in locale solo se abbiamo estratto dati validi (sicurezza per il PMV)
        # Determina la cartella dello script per salvare il file in modo affidabile
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_path = os.path.join(script_dir, OUTPUT_FILE)
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        print(f"Successo! Dati salvati correttamente in: {output_path}")
        print(json.dumps(data, indent=2))
        
    except Exception as e:
        print(f"Si è verificato un errore critico durante lo scraping: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
