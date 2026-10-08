package app.pocast.creator.common;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

public final class Timestamps {

	private static final DateTimeFormatter ISO_MILLIS = DateTimeFormatter
			.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
			.withZone(ZoneOffset.UTC);

	private Timestamps() {
	}

	public static Instant now(Clock clock) {
		return clock.instant().truncatedTo(ChronoUnit.MILLIS);
	}

	public static String iso(Instant value) {
		return value == null ? null : ISO_MILLIS.format(value);
	}
}
