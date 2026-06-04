CREATE TABLE `importadores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cnpj` varchar(18) NOT NULL,
	`razaoSocial` varchar(255) NOT NULL,
	`nomeFantasia` varchar(255),
	`inscricaoEstadual` varchar(30),
	`cnae` varchar(20),
	`endereco` varchar(255),
	`bairro` varchar(100),
	`cep` varchar(10),
	`municipio` varchar(100),
	`uf` varchar(2),
	`telefone` varchar(20),
	`email` varchar(255),
	`editalDBF` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `importadores_id` PRIMARY KEY(`id`),
	CONSTRAINT `importadores_cnpj_unique` UNIQUE(`cnpj`)
);
--> statement-breakpoint
CREATE TABLE `recintos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codigo` varchar(20) NOT NULL,
	`nome` varchar(255) NOT NULL,
	`tipo` enum('porto','porto_seco','aeroporto','fronteira') NOT NULL,
	`cidade` varchar(100),
	`uf` varchar(2),
	`administrador` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recintos_id` PRIMARY KEY(`id`),
	CONSTRAINT `recintos_codigo_unique` UNIQUE(`codigo`)
);
