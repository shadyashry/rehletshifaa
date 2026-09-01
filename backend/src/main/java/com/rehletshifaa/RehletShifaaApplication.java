package com.rehletshifaa;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class RehletShifaaApplication {
    private RehletShifaaApplication() {}
    public static void main(String[] args) { SpringApplication.run(RehletShifaaApplication.class, args); }
}
