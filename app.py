import logging
import time
from datetime import datetime, timezone
import threading
from flask import Flask, jsonify, render_template, request
import requests
import feedparser
from bs4 import BeautifulSoup

# Initialize Flask App
app = Flask(__name__, static_folder='static', template_folder='templates')

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
FEED_URL = 'https://docs.cloud.google.com/feeds/bigquery-release-notes.xml'
CACHE_DURATION_SECS = 600  # 10 minutes cache

# In-memory Cache
cache = {
    'data': None,
    'last_updated': None
}
cache_lock = threading.Lock()

def parse_entry_summary(summary_html):
    """
    Parses the HTML summary of a feed entry and splits it into individual updates
    grouped by <h3> category headers (e.g., Feature, Issue, Deprecated).
    """
    if not summary_html:
        return []
        
    soup = BeautifulSoup(summary_html, 'html.parser')
    updates = []
    
    current_type = "Update"
    current_nodes = []
    
    for child in soup.children:
        # Check if it is a tag and name is h3
        if child.name == 'h3':
            # Save the previous accumulated block
            if current_nodes:
                content_html = "".join(str(n) for n in current_nodes)
                text_content = "".join(n.get_text() for n in current_nodes).strip()
                updates.append({
                    'type': current_type,
                    'content': content_html,
                    'text': text_content
                })
            current_type = child.get_text().strip()
            current_nodes = []
        elif child.name:
            current_nodes.append(child)
            
    # Save the final block
    if current_nodes or current_type != "Update":
        content_html = "".join(str(n) for n in current_nodes)
        text_content = "".join(n.get_text() for n in current_nodes).strip()
        updates.append({
            'type': current_type,
            'content': content_html,
            'text': text_content
        })
        
    # Fallback if parsing resulted in no updates (flat HTML structure)
    if not updates and summary_html:
        updates.append({
            'type': 'Update',
            'content': summary_html,
            'text': soup.get_text().strip()
        })
        
    return updates

def fetch_and_parse_feed():
    """
    Fetches the RSS/Atom feed from Google Cloud and parses it.
    """
    logger.info("Fetching BigQuery release notes feed from: %s", FEED_URL)
    
    # Fetch content with requests to ensure proper headers/timeouts
    response = requests.get(FEED_URL, timeout=15)
    response.raise_for_status()
    
    # Parse with feedparser
    parsed_feed = feedparser.parse(response.content)
    
    releases = []
    for entry in parsed_feed.entries:
        # Parse the summary HTML into structured updates
        summary_html = entry.get('summary', '') or entry.get('content', [{}])[0].get('value', '')
        updates = parse_entry_summary(summary_html)
        
        releases.append({
            'id': entry.get('id', entry.get('link', '')),
            'title': entry.get('title', 'Unknown Date'),
            'updated': entry.get('updated', ''),
            'link': entry.get('link', ''),
            'updates': updates
        })
        
    return {
        'title': parsed_feed.feed.get('title', 'BigQuery Release Notes'),
        'link': parsed_feed.feed.get('link', 'https://cloud.google.com/bigquery/docs/release-notes'),
        'releases': releases
    }

def get_feed_data(force_refresh=False):
    """
    Returns feed data from cache if valid, otherwise fetches and updates cache.
    """
    global cache
    now = time.time()
    
    if not force_refresh and cache['data'] and cache['last_updated'] and (now - cache['last_updated'] < CACHE_DURATION_SECS):
        logger.info("Serving feed data from cache")
        return cache['data'], cache['last_updated'], False
        
    with cache_lock:
        # Double check after acquiring lock
        if not force_refresh and cache['data'] and cache['last_updated'] and (now - cache['last_updated'] < CACHE_DURATION_SECS):
            return cache['data'], cache['last_updated'], False
            
        try:
            feed_data = fetch_and_parse_feed()
            cache['data'] = feed_data
            cache['last_updated'] = now
            return feed_data, now, True
        except Exception as e:
            logger.error("Failed to fetch or parse feed: %s", e, exc_info=True)
            # If we have stale cache, return it rather than erroring out
            if cache['data']:
                logger.warning("Returning stale cache data due to fetch error")
                return cache['data'], cache['last_updated'], False
            raise e

# Routes
@app.route('/')
def index():
    """Renders the single page application interface."""
    return render_template('index.html')

@app.route('/api/releases')
def api_releases():
    """
    API endpoint returning the parsed release notes.
    Accepts ?refresh=true query parameter to force refresh.
    """
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        data, last_updated_epoch, was_refreshed = get_feed_data(force_refresh=force_refresh)
        
        # Format last updated timestamp
        last_updated_dt = datetime.fromtimestamp(last_updated_epoch, tz=timezone.utc)
        last_updated_str = last_updated_dt.isoformat()
        
        return jsonify({
            'success': True,
            'data': data,
            'last_updated': last_updated_str,
            'refreshed': was_refreshed
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
