package app.pocast.creator;

import app.pocast.creator.config.CreatorProperties;
import app.pocast.creator.config.DatabaseUrl;
import java.util.Arrays;
import java.util.ArrayList;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(CreatorProperties.class)
public class CreatorServiceApplication {

	public static void main(String[] args) {
		var isMigration = Arrays.asList(args).contains("migrate");
		var arguments = new ArrayList<>(Arrays.asList(args));
		if (isMigration) {
			arguments.add("--spring.flyway.enabled=true");
			arguments.add("--spring.rabbitmq.listener.simple.auto-startup=false");
		}

		var application = new SpringApplication(CreatorServiceApplication.class);
		application.setDefaultProperties(DatabaseUrl.toSpringProperties(System.getenv("CREATOR_DATABASE_URL")));
		var context = application.run(arguments.toArray(String[]::new));
		if (isMigration) {
			System.exit(SpringApplication.exit(context));
		}
	}
}
