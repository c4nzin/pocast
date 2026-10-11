package app.pocast.creator.health;

import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.stereotype.Service;

@Service
public class HealthService {

	public record HealthStatus(boolean ok) {
	}

	private final DataSource dataSource;

	public HealthService(DataSource dataSource) {
		this.dataSource = dataSource;
	}

	public HealthStatus check() {
		try (var connection = dataSource.getConnection(); var statement = connection.createStatement()) {
			statement.execute("SELECT 1");
			return new HealthStatus(true);
		}
		catch (SQLException error) {
			throw new IllegalStateException("Database is unavailable", error);
		}
	}
}
