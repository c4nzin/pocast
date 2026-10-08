package app.pocast.creator.feed;

import app.pocast.creator.episodes.Episode;
import app.pocast.creator.shows.Show;
import java.io.StringWriter;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;
import javax.xml.stream.XMLOutputFactory;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamWriter;

public final class RssFeedWriter {

	private static final String ITUNES = "http://www.itunes.com/dtds/podcast-1.0.dtd";
	private static final String ATOM = "http://www.w3.org/2005/Atom";
	private static final XMLOutputFactory FACTORY = XMLOutputFactory.newFactory();
	private static final DateTimeFormatter RFC_1123 = DateTimeFormatter.RFC_1123_DATE_TIME.withZone(ZoneOffset.UTC);

	private RssFeedWriter() {
	}

	public static String write(
			Show show,
			List<Episode> episodes,
			String feedUrl,
			Function<String, String> mediaUrl) {
		var buffer = new StringWriter();
		try {
			var xml = FACTORY.createXMLStreamWriter(buffer);
			xml.writeStartDocument("UTF-8", "1.0");
			xml.writeStartElement("rss");
			xml.writeAttribute("version", "2.0");
			xml.writeNamespace("itunes", ITUNES);
			xml.writeNamespace("atom", ATOM);
			xml.writeStartElement("channel");
			writeChannel(xml, show, feedUrl);
			for (var episode : episodes) {
				writeItem(xml, episode, mediaUrl.apply(episode.getMediaKey()));
			}
			xml.writeEndElement();
			xml.writeEndElement();
			xml.writeEndDocument();
			xml.close();
		}
		catch (XMLStreamException error) {
			throw new IllegalStateException("Could not render feed for show " + show.getId(), error);
		}
		return buffer.toString();
	}

	private static void writeChannel(XMLStreamWriter xml, Show show, String feedUrl) throws XMLStreamException {
		xml.writeEmptyElement(ATOM, "link");
		xml.writeAttribute("href", feedUrl);
		xml.writeAttribute("rel", "self");
		xml.writeAttribute("type", "application/rss+xml");
		text(xml, "title", show.getTitle());
		text(xml, "link", feedUrl);
		text(xml, "description", show.getDescription());
		text(xml, "language", show.getLanguage());
		text(xml, "generator", "pocast");
		itunes(xml, "author", show.getAuthor());
		itunes(xml, "summary", show.getDescription());
		itunes(xml, "explicit", Boolean.toString(show.isExplicit()));
		itunes(xml, "type", "episodic");
		if (show.getImageUrl() != null) {
			xml.writeEmptyElement(ITUNES, "image");
			xml.writeAttribute("href", show.getImageUrl());
		}
		writeCategory(xml, show);
	}

	private static void writeCategory(XMLStreamWriter xml, Show show) throws XMLStreamException {
		if (show.getCategoryParentName() == null) {
			xml.writeEmptyElement(ITUNES, "category");
			xml.writeAttribute("text", show.getCategoryName());
			return;
		}
		xml.writeStartElement(ITUNES, "category");
		xml.writeAttribute("text", show.getCategoryParentName());
		xml.writeEmptyElement(ITUNES, "category");
		xml.writeAttribute("text", show.getCategoryName());
		xml.writeEndElement();
	}

	private static void writeItem(XMLStreamWriter xml, Episode episode, String url) throws XMLStreamException {
		xml.writeStartElement("item");
		text(xml, "title", episode.getTitle());
		text(xml, "description", episode.getDescription());
		xml.writeStartElement("guid");
		xml.writeAttribute("isPermaLink", "false");
		xml.writeCharacters(episode.getId().toString());
		xml.writeEndElement();
		text(xml, "pubDate", RFC_1123.format(episode.getPublishedAt()));
		xml.writeEmptyElement("enclosure");
		xml.writeAttribute("url", url);
		xml.writeAttribute("length", String.valueOf(episode.getMediaSizeBytes()));
		xml.writeAttribute("type", episode.getMediaContentType());
		itunes(xml, "duration", episode.getDurationSeconds() == null ? null : episode.getDurationSeconds().toString());
		itunes(xml, "episodeType", episode.getEpisodeType().name().toLowerCase(Locale.ROOT));
		itunes(xml, "season", episode.getSeasonNumber() == null ? null : episode.getSeasonNumber().toString());
		itunes(xml, "episode", episode.getEpisodeNumber() == null ? null : episode.getEpisodeNumber().toString());
		itunes(xml, "explicit", Boolean.toString(episode.isExplicit()));
		xml.writeEndElement();
	}

	private static void text(XMLStreamWriter xml, String name, String value) throws XMLStreamException {
		if (value == null) {
			return;
		}
		xml.writeStartElement(name);
		xml.writeCharacters(value);
		xml.writeEndElement();
	}

	private static void itunes(XMLStreamWriter xml, String name, String value) throws XMLStreamException {
		if (value == null) {
			return;
		}
		xml.writeStartElement(ITUNES, name);
		xml.writeCharacters(value);
		xml.writeEndElement();
	}
}
