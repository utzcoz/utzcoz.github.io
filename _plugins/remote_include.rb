require 'net/http'
require 'uri'

module Jekyll
  class RemoteInclude < Liquid::Tag
    def initialize(tag_name, url, tokens)
      super
      @url = url.strip
    end

    def render(context)
      # Resolve variable references or use literal URL
      url = context[@url] || @url
      uri = URI.parse(url.strip)
      fetch(uri)
    end

    private

    def fetch(uri, redirect_limit = 5)
      raise "Too many redirects" if redirect_limit == 0

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https') do |http|
        http.get(uri.request_uri)
      end
      case response
      when Net::HTTPSuccess
        response.body.force_encoding('utf-8')
      when Net::HTTPRedirection
        fetch(URI.parse(response['location']), redirect_limit - 1)
      else
        raise "Failed to fetch #{uri}: #{response.code} #{response.message}"
      end
    end
  end
end

Liquid::Template.register_tag('remote_include', Jekyll::RemoteInclude)
