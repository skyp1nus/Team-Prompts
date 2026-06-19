# Build context is ./backend
# syntax=docker/dockerfile:1

# --- Build stage ----------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy the solution and project files first so `restore` is cached across
# source changes. Paths are preserved relative to the build context (./backend).
COPY TeamPrompts.slnx ./
COPY src/TeamPrompts.Api/TeamPrompts.Api.csproj src/TeamPrompts.Api/
COPY src/TeamPrompts.Application/TeamPrompts.Application.csproj src/TeamPrompts.Application/
COPY src/TeamPrompts.Domain/TeamPrompts.Domain.csproj src/TeamPrompts.Domain/
COPY src/TeamPrompts.Infrastructure/TeamPrompts.Infrastructure.csproj src/TeamPrompts.Infrastructure/

RUN dotnet restore src/TeamPrompts.Api/TeamPrompts.Api.csproj

# Copy the rest of the source and publish.
COPY . .
RUN dotnet publish src/TeamPrompts.Api -c Release -o /app/publish --no-restore

# --- Runtime stage --------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# curl is used by the compose healthcheck against /health.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish ./

EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080

ENTRYPOINT ["dotnet", "TeamPrompts.Api.dll"]
